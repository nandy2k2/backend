const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const present = (value) => value !== undefined && value !== null && value !== "";
function calculatePoLine(item = {}, strict = false) {
  const errors = [];
  const read = (value, label) => {
    const n = present(value) ? Number(value) : 0;
    if (!Number.isFinite(n) || n < 0) { errors.push(label + " must be a non-negative number"); return 0; }
    return n;
  };
  const quantity = read(item.quantity, "Quantity");
  const price = read(present(item.price) ? item.price : present(item.rate) ? item.rate : item.estimatedprice, "Unit rate");
  if (quantity <= 0) errors.push("Quantity must be greater than zero");
  const subtotal = roundMoney(quantity * price);
  const discounttype = item.discounttype || (present(item.discountpercent) || present(item.discountpercentage) ? "Percentage" : "Amount");
  if (!["Amount", "Percentage"].includes(discounttype)) errors.push("Discount type must be Amount or Percentage");
  const discount = read(present(item.discount) ? item.discount : discounttype === "Percentage" ? item.discountpercent ?? item.discountpercentage : item.discountamount, "Discount");
  if (discounttype === "Percentage" && discount > 100) errors.push("Discount percentage cannot exceed 100");
  let discountamount = roundMoney(discounttype === "Percentage" ? subtotal * discount / 100 : discount);
  if (discountamount > subtotal) errors.push("Discount cannot exceed item subtotal");
  discountamount = Math.min(discountamount, subtotal);
  const taxableamount = roundMoney(subtotal - discountamount);
  const gst = read(present(item.gst) ? item.gst : present(item.taxrate) ? item.taxrate : Number(item.sgst || 0) + Number(item.cgst || 0) + Number(item.igst || 0), "GST/Tax percentage");
  if (gst > 100) errors.push("GST/Tax percentage cannot exceed 100");
  const gstamount = roundMoney(taxableamount * Math.min(gst, 100) / 100);
  const total = roundMoney(taxableamount + gstamount);
  if (strict && errors.length) throw new Error(errors.join("; "));
  return { ...item, quantity, price, discounttype, discount, gst, subtotal, discountamount, taxableamount, gstamount, taxamount: gstamount, tax: gstamount, total, grandtotal: total, estimatedtotal: subtotal, unitPriceWithTax: quantity ? roundMoney(total / quantity) : 0, calculationerror: errors.join("; ") };
}
function summarizePo(items = [], strict = false) {
  const lines = items.map((item) => calculatePoLine(item, strict));
  const sum = (field) => lines.reduce((total, line) => total + Math.round(line[field] * 100), 0) / 100;
  const subtotal = sum("subtotal"), discountamount = sum("discountamount"), taxableamount = sum("taxableamount"), gstamount = sum("gstamount"), total = sum("total");
  return { subtotal, discountamount, taxableamount, gstamount, taxamount: gstamount, grandtotal: total, total, price: subtotal, amount: subtotal, discount: discountamount, gst: taxableamount ? roundMoney(gstamount / taxableamount * 100) : 0, netprice: total, actualAmount: total };
}
module.exports = { calculatePoLine, summarizePo, roundMoney };
