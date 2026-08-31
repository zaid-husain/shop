import jsPDF from "jspdf";
import type { Customer, LedgerEntry } from "@/lib/db";
import { formatINR, formatDate } from "@/lib/format";

type Opts = {
  customer: Customer;
  entries: LedgerEntry[]; // newest-first or any order; we sort ascending here
  shopName?: string;
  shopPhone?: string;
};

export function generateStatementPDF({
  customer,
  entries,
  shopName = "Bharat Auto Parts",
  shopPhone = "",
}: Opts): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;

  // Header band
  doc.setFillColor(33, 64, 154);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(shopName, M, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Customer Statement", M, 58);
  if (shopPhone) doc.text(shopPhone, M, 74);

  // Customer block
  y = 120;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(customer.name, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  const meta: string[] = [];
  if (customer.mobile) meta.push(`Mobile: ${customer.mobile}`);
  if (customer.vehicle_number) meta.push(`Vehicle: ${customer.vehicle_number}`);
  if (customer.address) meta.push(customer.address);
  if (meta.length) doc.text(meta.join("  ·  "), M, y + 16);

  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, W - M, y, { align: "right" });

  // Sort ascending by entry_date for running balance
  const sorted = [...entries].sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    return d !== 0 ? d : a.created_at.localeCompare(b.created_at);
  });

  // Table
  y = 170;
  const cols = [
    { x: M, w: 75, label: "Date" },
    { x: M + 75, w: 100, label: "Type" },
    { x: M + 175, w: 165, label: "Note" },
    { x: M + 340, w: 80, label: "Amount", align: "right" as const },
    { x: M + 420, w: 95, label: "Balance", align: "right" as const },
  ];

  function drawHead() {
    doc.setFillColor(245, 247, 250);
    doc.rect(M, y - 14, W - M * 2, 22, "F");
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    for (const c of cols) {
      doc.text(c.label, c.align === "right" ? c.x + c.w : c.x + 4, y, { align: c.align ?? "left" });
    }
    y += 14;
  }
  drawHead();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  let bal = 0;
  let credit = 0;
  let payment = 0;

  for (const e of sorted) {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = M;
      drawHead();
    }
    const amt = Number(e.amount);
    if (e.entry_type === "credit") {
      bal += amt;
      credit += amt;
    } else {
      bal -= amt;
      payment += amt;
    }
    doc.setTextColor(40, 40, 40);
    doc.text(formatDate(e.entry_date), cols[0].x + 4, y);
    doc.setTextColor(
      e.entry_type === "credit" ? 180 : 40,
      e.entry_type === "credit" ? 40 : 130,
      40,
    );
    doc.text(
      e.entry_type === "credit"
        ? "Credit (Udhaar)"
        : `Payment${e.payment_method ? ` · ${e.payment_method}` : ""}`,
      cols[1].x + 4,
      y,
    );
    doc.setTextColor(40, 40, 40);
    const note = e.note ?? "";
    doc.text(note.length > 38 ? note.slice(0, 37) + "…" : note, cols[2].x + 4, y);
    doc.text(
      `${e.entry_type === "credit" ? "+" : "−"}${formatINR(amt)}`,
      cols[3].x + cols[3].w,
      y,
      {
        align: "right",
      },
    );
    doc.text(formatINR(Math.abs(bal)) + (bal < 0 ? " Cr" : ""), cols[4].x + cols[4].w, y, {
      align: "right",
    });
    y += 18;
    doc.setDrawColor(235, 235, 235);
    doc.line(M, y - 8, W - M, y - 8);
  }

  if (sorted.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text("No transactions recorded.", M, y + 4);
    y += 20;
  }

  // Totals
  y += 14;
  doc.setDrawColor(220, 220, 220);
  doc.line(M, y, W - M, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text("Total Credit", M, y);
  doc.text(formatINR(credit), W - M, y, { align: "right" });
  y += 18;
  doc.text("Total Received", M, y);
  doc.text(formatINR(payment), W - M, y, { align: "right" });
  y += 22;

  doc.setFillColor(bal > 0 ? 254 : 240, bal > 0 ? 232 : 250, bal > 0 ? 232 : 240);
  doc.rect(M, y - 16, W - M * 2, 32, "F");
  doc.setFontSize(13);
  doc.setTextColor(bal > 0 ? 180 : 30, bal > 0 ? 30 : 120, 30);
  doc.text(
    bal > 0 ? "Outstanding (You will get)" : bal < 0 ? "Advance (You will give)" : "Cleared",
    M + 8,
    y + 4,
  );
  doc.text(formatINR(Math.abs(bal)), W - M - 8, y + 4, { align: "right" });

  y += 50;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("Thank you for your business.", M, y);

  return doc;
}

export function downloadStatement(opts: Opts) {
  const doc = generateStatementPDF(opts);
  const safe = opts.customer.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  doc.save(`Statement_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function statementPdfBlob(opts: Opts): Blob {
  return generateStatementPDF(opts).output("blob");
}
