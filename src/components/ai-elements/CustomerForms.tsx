/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { AIActionCard, AIActionSubmitButton } from "./AIActionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, UserCog, UserMinus, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { supabase } from "@/integrations/supabase/client";

async function executeAction(actionType: string, payload: any) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token || "";

  const res = await fetch("/api/ai-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ type: actionType, payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to execute action");
  return data;
}

export function CreateCustomerForm({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const [name, setName] = useState(payload.name || "");
  const [mobile, setMobile] = useState(payload.mobile || "");
  const [vehicle, setVehicle] = useState(payload.vehicleNumber || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await executeAction("CREATE_CUSTOMER", {
        name,
        mobile,
        vehicleNumber: vehicle,
      });
      toast.success("Customer created successfully");
      setIsLocked(true);
      onComplete();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AIActionCard
      title="Create Customer"
      icon={<UserPlus className="h-5 w-5 text-green-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-3">
        <div>
          <Label>Customer Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Mobile Number (Optional)</Label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        <div>
          <Label>Vehicle Number (Optional)</Label>
          <Input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="uppercase"
          />
        </div>
        <AIActionSubmitButton isLoading={isLoading} onClick={handleSubmit} disabled={!name}>
          Confirm Create
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function UpdateCustomerForm({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const { customer } = payload;

  const [mobile, setMobile] = useState(customer.mobile || "");
  const [vehicle, setVehicle] = useState(customer.vehicle_number || "");

  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await executeAction("UPDATE_CUSTOMER", {
        customerId: customer.id,
        customerName: customer.name,
        mobile,
        vehicleNumber: vehicle,
      });
      toast.success("Customer updated successfully");
      setIsLocked(true);
      onComplete();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AIActionCard
      title={`Update ${customer.name}`}
      icon={<UserCog className="h-5 w-5 text-orange-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-3">
        <div>
          <Label>Mobile Number</Label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
        <div>
          <Label>Vehicle Number</Label>
          <Input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="uppercase"
          />
        </div>
        <AIActionSubmitButton isLoading={isLoading} onClick={handleSubmit}>
          Update Details
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function DeleteCustomerCard({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const { customer } = payload;
  const hasBalance = customer.balance_cache !== 0;

  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await executeAction("DELETE_CUSTOMER", {
        customerId: customer.id,
        customerName: customer.name,
      });
      toast.success("Customer deleted successfully");
      setIsLocked(true);
      onComplete();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AIActionCard
      title={`Delete ${customer.name}`}
      icon={<UserMinus className="h-5 w-5 text-red-500" />}
      isLocked={isLocked}
      className="border-red-500/20"
    >
      <div className="space-y-3">
        <p className="text-sm">
          Are you sure you want to delete <strong>{customer.name}</strong>?
        </p>
        <div className="bg-muted p-2 rounded-md">
          <Label>Current Balance:</Label>
          <div className={`text-lg font-bold ${hasBalance ? "text-red-600" : "text-green-600"}`}>
            ₹{customer.balance_cache}
          </div>
        </div>
        {hasBalance && (
          <div className="bg-orange-500/10 text-orange-600 p-2 rounded-md text-sm border border-orange-500/20">
            This customer has a non-zero balance. They will be archived instead of permanently
            deleted.
          </div>
        )}
        <AIActionSubmitButton isLoading={isLoading} onClick={handleSubmit} disabled={false}>
          Yes, Delete Customer
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function KhataEntryForm({
  payload,
  intentType,
  onComplete,
}: {
  payload: any;
  intentType: string;
  onComplete: () => void;
}) {
  const { customer, amount } = payload;
  const [type, setType] = useState(
    intentType === "PAYMENT_CREATE"
      ? "PAYMENT_CREATE"
      : intentType === "DEBIT_CREATE"
        ? "DEBIT_CREATE"
        : "CREDIT_CREATE",
  );
  const [entryAmount, setEntryAmount] = useState(amount?.toString() || "");

  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      if (!entryAmount || parseFloat(entryAmount) <= 0) throw new Error("Invalid amount");
      await executeAction(type, {
        customerId: customer.id,
        customerName: customer.name,
        amount: parseFloat(entryAmount),
      });

      toast.success("Khata entry recorded");
      setIsLocked(true);
      onComplete();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AIActionCard
      title={`Khata Entry: ${customer.name}`}
      icon={<BookOpen className="h-5 w-5 text-purple-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium">Outstanding Balance</span>
          <span
            className={`text-lg font-bold ${customer.balance_cache > 0 ? "text-red-500" : customer.balance_cache < 0 ? "text-green-500" : ""}`}
          >
            ₹{Math.abs(customer.balance_cache)}{" "}
            {customer.balance_cache > 0 ? "Due" : customer.balance_cache < 0 ? "Advance" : ""}
          </span>
        </div>

        <RadioGroup value={type} onValueChange={setType} className="flex flex-col gap-2">
          <div
            className="flex items-center space-x-2 border rounded-md p-3 cursor-pointer"
            onClick={() => setType("PAYMENT_CREATE")}
          >
            <RadioGroupItem value="PAYMENT_CREATE" id="payment" />
            <Label htmlFor="payment" className="flex-1 cursor-pointer text-green-600 font-medium">
              Payment Received (Cash In)
            </Label>
          </div>
          <div
            className="flex items-center space-x-2 border rounded-md p-3 cursor-pointer"
            onClick={() => setType("CREDIT_CREATE")}
          >
            <RadioGroupItem value="CREDIT_CREATE" id="credit" />
            <Label htmlFor="credit" className="flex-1 cursor-pointer text-orange-600 font-medium">
              Udhaar Diya (Credit)
            </Label>
          </div>
          <div
            className="flex items-center space-x-2 border rounded-md p-3 cursor-pointer"
            onClick={() => setType("DEBIT_CREATE")}
          >
            <RadioGroupItem value="DEBIT_CREATE" id="debit" />
            <Label htmlFor="debit" className="flex-1 cursor-pointer text-red-600 font-medium">
              Charge / Fine (Debit)
            </Label>
          </div>
        </RadioGroup>

        <div>
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            value={entryAmount}
            onChange={(e) => setEntryAmount(e.target.value)}
          />
        </div>

        <AIActionSubmitButton
          isLoading={isLoading}
          onClick={handleSubmit}
          disabled={!entryAmount || parseFloat(entryAmount) <= 0}
        >
          Confirm Entry
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}
