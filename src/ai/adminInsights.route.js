"use strict";
// Additive read-only analytics. Mount behind verifyAdminToken and requireDatabase.
const {Router}=require('express');
const mongoose=require('mongoose');
const router=Router();
const delivered='تم التسليم والدفع';
const money=n=>Math.round((Number(n)||0)*100)/100;
router.get('/sales',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const days=Number(req.query.days||30);
 if(!Number.isInteger(days)||days<1||days>365)return res.status(400).json({success:false,message:'days must be 1..365'});
 if(mongoose.connection.readyState!==1)return res.status(503).json({success:false,message:'Database unavailable'});
 try{
  const Order=mongoose.models.Order;
  if(!Order)return res.status(503).json({success:false,message:'Order model not registered'});
  const since=new Date(Date.now()-days*86400000);
  const orders=await Order.find({createdAt:{$gte:since}}).select('createdAt status isPaid isDelivered products total totals.total totalPrice').lean().limit(10000);
  const stats=new Map();let placed=0,deliveredCount=0,deliveredRevenue=0;
  for(const o of orders){
   placed++;
   const completed=o.status===delivered || (o.isPaid===true && o.isDelivered===true);
   if(completed){deliveredCount++;deliveredRevenue+=money(o.totals?.total??o.totalPrice??o.total);}
   for(const line of Array.isArray(o.products)?o.products:[]){
    const id=typeof line.productId==='string'?line.productId:'';if(!id)continue;
    const qty=Number(line.quantity);if(!Number.isFinite(qty)||qty<=0)continue;
    const row=stats.get(id)||{productId:id,orderedUnits:0,deliveredUnits:0};row.orderedUnits+=qty;
    if(completed)row.deliveredUnits+=qty;stats.set(id,row);
   }
  }
  res.json({success:true,periodDays:days,ordersAnalyzed:orders.length,truncated:orders.length===10000,ordersPlaced:placed,ordersDelivered:deliveredCount,deliveredRevenueTND:money(deliveredRevenue),deliveryCompletionRate:placed?Number((deliveredCount/placed*100).toFixed(2)):null,topProducts:[...stats.values()].sort((a,b)=>b.deliveredUnits-a.deliveredUnits).slice(0,15),limitations:['Revenue uses stored order totals; verify COD reconciliation separately.','Checkout abandonment and website conversion rates require funnel analytics events, not order records alone.','No SEO ranking data is available from this endpoint.']});
 }catch(e){console.error('[Admin insights] query failed');res.status(500).json({success:false,message:'Unable to calculate sales insights'});}
});
module.exports=router;
