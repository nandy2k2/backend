const {calculatePoLine,summarizePo}=require('./purchase2Amounts');
function compareQuotes(items,quotes){
 const rows=items.map(item=>{const offers=quotes.flatMap(q=>{const line=q.lines.find(l=>String(l.pritemid)===String(item._id));return line?[{vendorid:q.vendorid,vendor:q.vendor,...calculatePoLine({...line,quantity:item.quantity},true)}]:[];});const lowest=offers.length?Math.min(...offers.map(x=>x.total)):null;return {...item,id:String(item._id),offers,lowest,l1vendors:offers.filter(x=>x.total===lowest).map(x=>x.vendorid)};});
 const totals=quotes.map(q=>{const lines=items.map(i=>q.lines.find(l=>String(l.pritemid)===String(i._id)));const complete=lines.every(Boolean);const total=complete?summarizePo(lines.map((l,i)=>({...l,quantity:items[i].quantity})),true).total:null;return {id:q.vendorid,vendor:q.vendor,total,complete,paymentterms:q.paymentterms};});
 const complete=totals.filter(t=>t.complete),lowest=complete.length?Math.min(...complete.map(t=>t.total)):null;
 return {rows,totals:totals.map(t=>({...t,l1:t.complete&&t.total===lowest})),lowest};
}
module.exports={compareQuotes};
