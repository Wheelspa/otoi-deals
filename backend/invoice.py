import io
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

IST = timezone(timedelta(hours=5, minutes=30))
GST_RATES = (5, 18)

STATE_CODES = {
    "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04", "Uttarakhand": "05",
    "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09", "Bihar": "10", "Sikkim": "11",
    "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14", "Mizoram": "15", "Tripura": "16", "Meghalaya": "17",
    "Assam": "18", "West Bengal": "19", "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23",
    "Gujarat": "24", "Dadra and Nagar Haveli and Daman and Diu": "26", "Maharashtra": "27", "Karnataka": "29",
    "Goa": "30", "Lakshadweep": "31", "Kerala": "32", "Tamil Nadu": "33", "Puducherry": "34",
    "Andaman and Nicobar Islands": "35", "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38",
}

DEFAULT_SETTINGS = {
    "legal_name": "Wheelspa Private Limited", "brand": "Dealwills", "gstin": "27AACCW5974G1ZX",
    "address": "", "state": "Maharashtra", "phone": "", "email": "", "prefix": "DW",
}


def tax_totals(subtotal: float, discount: float, credit: float, delivery: float, rate: float) -> dict:
    """GST is added on top of the discounted goods value plus delivery."""
    taxable = round(max(subtotal - discount - credit, 1) + delivery, 2)
    gst = round(taxable * rate / 100, 2)
    return {"taxable_value": taxable, "gst_amount": gst, "total": round(taxable + gst, 2)}


def financial_year(dt: datetime) -> str:
    d = dt.astimezone(IST)
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def build_invoice(o: dict, seller: dict, number: str, issued: datetime) -> dict:
    rate = o.get("gst_rate", 18)
    buyer_state = (o.get("address") or {}).get("state", "")
    intra = buyer_state.strip().lower() == seller["state"].strip().lower()
    gst = o.get("gst_amount", 0)
    half = round(gst / 2, 2)
    return {
        "number": number, "date": issued, "seller": seller,
        "buyer": {"name": o.get("customer_name"), "phone": o.get("phone"), "email": o.get("email"),
                  "address": o.get("address"), "state": buyer_state, "state_code": STATE_CODES.get(buyer_state, "")},
        "place_of_supply": buyer_state, "order_number": o["order_number"], "payment_method": o.get("payment_method"),
        "payment_id": o.get("payment_id"),
        "items": [{"description": o["product_name"], "hsn": o.get("hsn_code", ""), "qty": line["qty"],
                   "unit_price": line["price"], "amount": round(line["qty"] * line["price"], 2)} for line in o["lines"]],
        "subtotal": o["subtotal"], "coupon_code": o.get("coupon_code"), "coupon_discount": o.get("coupon_discount", 0),
        "credit_used": o.get("credit_used", 0), "delivery_charge": o.get("delivery_charge", 0),
        "taxable_value": o.get("taxable_value", o["total"]), "gst_rate": rate, "intra_state": intra,
        "cgst": half if intra else 0, "sgst": round(gst - half, 2) if intra else 0, "igst": 0 if intra else gst,
        "gst_amount": gst, "total": o["total"],
    }


def rs(n) -> str:
    return f"Rs. {n:,.2f}"


def invoice_pdf(inv: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    navy, lime = colors.HexColor("#303D4E"), colors.HexColor("#B0CB1F")
    s, b = inv["seller"], inv["buyer"]
    x0, y = 18 * mm, H - 22 * mm

    c.setFillColor(navy); c.setFont("Helvetica-Bold", 22); c.drawString(x0, y, s.get("brand") or "Dealwills")
    c.setFillColor(lime); c.drawString(x0 + c.stringWidth(s.get("brand") or "Dealwills", "Helvetica-Bold", 22) + 4, y, ">>")
    c.setFillColor(navy); c.setFont("Helvetica-Bold", 16); c.drawRightString(W - x0, y, "TAX INVOICE")
    c.setFont("Helvetica", 9); c.setFillColor(colors.HexColor("#555555"))
    c.drawRightString(W - x0, y - 14, f"Invoice No: {inv['number']}")
    c.drawRightString(W - x0, y - 26, f"Date: {inv['date'].astimezone(IST).strftime('%d %b %Y')}")
    c.drawRightString(W - x0, y - 38, f"Order: {inv['order_number']}")

    y -= 22
    c.setFillColor(colors.black); c.setFont("Helvetica-Bold", 10); c.drawString(x0, y, s["legal_name"])
    c.setFont("Helvetica", 9)
    seller_lines = [f"GSTIN: {s['gstin']}", s.get("address", ""), f"State: {s['state']} ({STATE_CODES.get(s['state'], '')})",
                    " · ".join(v for v in (s.get("phone"), s.get("email")) if v)]
    for line in [ln for ln in seller_lines if ln]:
        y -= 12; c.drawString(x0, y, line)

    y -= 26
    c.setFillColor(navy); c.setFont("Helvetica-Bold", 9); c.drawString(x0, y, "BILL TO / SHIP TO")
    c.drawString(W / 2 + 10, y, "PLACE OF SUPPLY")
    c.setFillColor(colors.black); c.setFont("Helvetica", 9)
    a = b.get("address") or {}
    buyer_lines = [b.get("name") or "", a.get("line1", ""), a.get("line2", ""),
                   f"{a.get('city', '')}, {a.get('state', '')} - {a.get('pincode', '')}", f"Phone: {b.get('phone') or ''}"]
    yy = y
    for line in [ln for ln in buyer_lines if ln]:
        yy -= 12; c.drawString(x0, yy, line)
    c.drawString(W / 2 + 10, y - 12, f"{inv['place_of_supply']} ({b.get('state_code', '')})")
    c.drawString(W / 2 + 10, y - 24, f"Payment: {(inv.get('payment_method') or '').upper()}")
    y = yy - 24

    cols = [x0, x0 + 88 * mm, x0 + 112 * mm, x0 + 128 * mm, W - x0]
    c.setFillColor(navy); c.rect(x0, y - 4, W - 2 * x0, 16, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 9)
    for i, h in enumerate(["Description", "HSN/SAC", "Qty", "Rate"]):
        c.drawString(cols[i] + 4, y + 1, h)
    c.drawRightString(cols[4] - 4, y + 1, "Amount")
    c.setFillColor(colors.black); c.setFont("Helvetica", 9)
    for it in inv["items"]:
        y -= 18
        c.drawString(cols[0] + 4, y, it["description"][:58])
        c.drawString(cols[1] + 4, y, it.get("hsn") or "-")
        c.drawString(cols[2] + 4, y, str(it["qty"]))
        c.drawString(cols[3] + 4, y, f"{it['unit_price']:,.2f}")
        c.drawRightString(cols[4] - 4, y, f"{it['amount']:,.2f}")
    y -= 10
    c.setStrokeColor(colors.HexColor("#DDDDDD")); c.line(x0, y, W - x0, y)

    rows = [("Subtotal", inv["subtotal"])]
    if inv["coupon_discount"]:
        rows.append((f"Coupon {inv['coupon_code']}", -inv["coupon_discount"]))
    if inv["credit_used"]:
        rows.append(("Referral credit", -inv["credit_used"]))
    rows.append(("Delivery charges", inv["delivery_charge"]))
    rows.append(("Taxable value", inv["taxable_value"]))
    if inv["intra_state"]:
        rows += [(f"CGST @ {inv['gst_rate'] / 2:g}%", inv["cgst"]), (f"SGST @ {inv['gst_rate'] / 2:g}%", inv["sgst"])]
    else:
        rows.append((f"IGST @ {inv['gst_rate']:g}%", inv["igst"]))
    for label, val in rows:
        y -= 15
        c.drawString(cols[2] + 4, y, label)
        c.drawRightString(cols[4] - 4, y, f"{val:,.2f}")
    y -= 22
    c.setFillColor(navy); c.rect(cols[2], y - 6, cols[4] - cols[2], 20, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 11)
    c.drawString(cols[2] + 4, y, "Grand Total"); c.drawRightString(cols[4] - 4, y, rs(inv["total"]))

    c.setFillColor(colors.HexColor("#777777")); c.setFont("Helvetica", 8)
    c.drawString(x0, 24 * mm, "This is a computer-generated invoice and does not require a signature.")
    c.drawString(x0, 20 * mm, f"{s['legal_name']} · GSTIN {s['gstin']} · Timely delivery always")
    c.showPage(); c.save()
    return buf.getvalue()
