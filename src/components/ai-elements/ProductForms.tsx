/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { AIActionCard, AIActionSubmitButton } from "./AIActionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Trash2, ArrowUpRight, ArrowDownRight, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";

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

export function CreateProductForm({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const [name, setName] = useState(payload.name || "");
  const [price, setPrice] = useState(payload.price?.toString() || "");
  const [quantity, setQuantity] = useState(payload.quantity?.toString() || "0");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await executeAction("CREATE_PRODUCT", {
        name,
        price: parseFloat(price),
        quantity: parseInt(quantity, 10) || 0,
      });
      toast.success("Product created successfully");
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
      title="Create Product"
      icon={<Package className="h-5 w-5 text-blue-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-3">
        <div>
          <Label>Product Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>Selling Price (₹)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label>Initial Stock</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <AIActionSubmitButton
          isLoading={isLoading}
          onClick={handleSubmit}
          disabled={!name || !price}
        >
          Confirm Create
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function UpdateProductForm({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const { product, newPrice } = payload;

  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(
    newPrice ? newPrice.toString() : product.selling_price.toString(),
  );
  const [stock, setStock] = useState(product.stock_quantity.toString());
  const [category, setCategory] = useState(product.category || "");

  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const { role } = useAuth();
  const canUpdate = role === "owner" || role === "manager";

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      const changes: Record<string, any> = {};
      if (name !== product.name) changes.name = name;
      if (parseFloat(price) !== product.selling_price) changes.selling_price = parseFloat(price);
      if (parseInt(stock, 10) !== product.stock_quantity)
        changes.stock_quantity = parseInt(stock, 10);
      if (category !== product.category) changes.category = category;

      if (Object.keys(changes).length === 0) {
        toast.info("No changes to update");
        return;
      }

      await executeAction("UPDATE_PRODUCT", {
        productId: product.id,
        changes,
      });
      toast.success("Product updated successfully");
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
      title={`Update ${product.name}`}
      icon={<Package className="h-5 w-5 text-orange-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-3">
        <div>
          <Label>Product Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>Selling Price (₹)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label>Stock Quantity</Label>
            <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        </div>
        <AIActionSubmitButton isLoading={isLoading} onClick={handleSubmit} disabled={!canUpdate}>
          {canUpdate ? "Update Product" : "Unauthorized"}
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function DeleteProductCard({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const { product, hasHistory } = payload;
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const { role } = useAuth();
  const canDelete = role === "owner";

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await executeAction("DELETE_PRODUCT", {
        productId: product.id,
        productName: product.name,
      });
      toast.success("Product deleted successfully");
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
      title={`Delete ${product.name}`}
      icon={<Trash2 className="h-5 w-5 text-red-500" />}
      isLocked={isLocked}
      className="border-red-500/20"
    >
      <div className="space-y-3">
        <p className="text-sm">
          Are you sure you want to delete <strong>{product.name}</strong>?
        </p>
        {hasHistory && (
          <div className="bg-orange-500/10 text-orange-600 p-2 rounded-md text-sm border border-orange-500/20">
            This product has associated invoices. It will be archived instead of permanently
            deleted.
          </div>
        )}
        <AIActionSubmitButton isLoading={isLoading} onClick={handleSubmit} disabled={!canDelete}>
          {canDelete ? "Yes, Delete Product" : "Owner access required"}
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}

export function StockAdjustmentForm({
  payload,
  onComplete,
}: {
  payload: any;
  onComplete: () => void;
}) {
  const { product, quantityChange } = payload;
  const isReduction = quantityChange < 0;

  const [type, setType] = useState(isReduction ? "remove" : "add");
  const [qty, setQty] = useState(Math.abs(quantityChange || 0).toString());

  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const { role } = useAuth();
  const canUpdate = role === "owner" || role === "manager";

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      let change = parseInt(qty, 10);
      if (isNaN(change) || change <= 0) throw new Error("Invalid quantity");
      if (type === "remove") change = -change;

      await executeAction("UPDATE_STOCK", {
        productId: product.id,
        productName: product.name,
        quantityChange: change,
        currentStock: product.stock_quantity,
        shopId: product.shop_id,
      });

      toast.success("Stock updated successfully");
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
      title={`Stock Adjust: ${product.name}`}
      icon={<PackageOpen className="h-5 w-5 text-indigo-500" />}
      isLocked={isLocked}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium">Current Stock</span>
          <span className="text-lg font-bold">{product.stock_quantity}</span>
        </div>

        <RadioGroup value={type} onValueChange={setType} className="flex gap-4">
          <div
            className="flex items-center space-x-2 border rounded-md p-2 flex-1 cursor-pointer"
            onClick={() => setType("add")}
          >
            <RadioGroupItem value="add" id="add" />
            <Label
              htmlFor="add"
              className="flex items-center gap-1 cursor-pointer text-green-600 font-medium"
            >
              <ArrowUpRight className="h-4 w-4" /> Add Stock
            </Label>
          </div>
          <div
            className="flex items-center space-x-2 border rounded-md p-2 flex-1 cursor-pointer"
            onClick={() => setType("remove")}
          >
            <RadioGroupItem value="remove" id="remove" />
            <Label
              htmlFor="remove"
              className="flex items-center gap-1 cursor-pointer text-red-600 font-medium"
            >
              <ArrowDownRight className="h-4 w-4" /> Remove
            </Label>
          </div>
        </RadioGroup>

        <div>
          <Label>Quantity</Label>
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>

        <AIActionSubmitButton
          isLoading={isLoading}
          onClick={handleSubmit}
          disabled={!qty || parseInt(qty) <= 0 || !canUpdate}
        >
          {canUpdate ? "Confirm Stock Change" : "Unauthorized"}
        </AIActionSubmitButton>
      </div>
    </AIActionCard>
  );
}
