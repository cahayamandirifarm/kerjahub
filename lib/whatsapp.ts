export function toWaNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let p = phone.replace(/\D/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p;
}

export function waLink(phone: string | null | undefined, text?: string): string | null {
  const num = toWaNumber(phone);
  if (!num) return null;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
