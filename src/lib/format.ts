export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatINRDecimal(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function nextInvoiceNumber(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = String(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()).padStart(5, "0");
  return `INV-${yy}${mm}${dd}-${rand}`;
}

export function buildWhatsAppUrl(mobile: string | null | undefined, message: string): string | null {
  if (!mobile) return null;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function buildDueReminderMessage(
  customerName: string,
  invoices: { invoice_number: string; total: number; due: number; created_at: string }[]
): string {
  const totalDue = invoices.reduce((s, i) => s + Number(i.due ?? 0), 0);
  const lines = invoices.map(
    (i) => `• ${i.invoice_number} — ${formatINR(Number(i.total))} (Due: ${formatINR(Number(i.due))})`
  );
  return (
    `*Bharat Auto Parts*\n\n` +
    `Namaste ${customerName},\n` +
    `Your pending payment reminder:\n\n` +
    lines.join("\n") +
    `\n\n*Total Due: ${formatINR(totalDue)}*\n\n` +
    `Please clear the dues at your earliest convenience.\n` +
    `Thank you!`
  );
}
