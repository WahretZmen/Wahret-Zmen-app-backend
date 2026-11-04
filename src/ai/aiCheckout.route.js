// CommonJS Express router for Am Hssin COD checkout.
// Integrates with existing ESM Product and createOrder modules via dynamic import.
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const router = express.Router();
router.use(express.json({ limit: '24kb' }));
router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
const importModule = file => import(pathToFileURL(path.resolve(__dirname,file)).href);
let dependencies;
async function deps() {
  if (!dependencies) dependencies = Promise.all([
    importModule('../products/product.model.js'),
    importModule('../orders/order.controller.js'),
    importModule('../orders/order.model.js')
  ]).then(([p,c,o]) => {
    // Vercel/Node may expose ESM exports through nested default wrappers.
    const resolveModel = (mod, name) => {
      const candidates = [mod, mod?.default, mod?.default?.default, mod?.[name], mod?.default?.[name]];
      const model = candidates.find(value => value && typeof value.findOne === 'function' && typeof value.find === 'function');
      if (!model) {
        const error = new Error(`${name.toUpperCase()}_MODEL_UNAVAILABLE`);
        error.code = `${name.toUpperCase()}_MODEL_UNAVAILABLE`;
        throw error;
      }
      return model;
    };
    const createOrder = [c?.createOrder, c?.default?.createOrder, c?.default?.default?.createOrder]
      .find(fn => typeof fn === 'function');
    if (!createOrder) {
      const error = new Error('CREATE_ORDER_UNAVAILABLE');
      error.code = 'CREATE_ORDER_UNAVAILABLE';
      throw error;
    }
    return { Product: resolveModel(p, 'Product'), createOrder, Order: resolveModel(o, 'Order') };
  }).catch(e => { dependencies = null; throw e; });
  return dependencies;
}
const Draft = mongoose.models.AmHssinCheckoutDraft || mongoose.model('AmHssinCheckoutDraft',new mongoose.Schema({
  tokenHash:{type:String,required:true,unique:true},
  customer:{type:mongoose.Schema.Types.Mixed,required:true},
  items:{type:[mongoose.Schema.Types.Mixed],required:true},
  summary:{type:mongoose.Schema.Types.Mixed,required:true},
  status:{type:String,enum:['quoted','processing','completed','failed'],default:'quoted'},
  orderId:String,
  error:String,
  emailNotificationStatus:{type:String,enum:['sending','sent','failed'],default:'failed'},
  emailNotificationSentAt:Date,
  emailNotificationClaimedAt:Date,
  expiresAt:{type:Date,required:true,index:{expires:0}}
},{timestamps:true}));
// AI requests use the SAME Order collection as the normal checkout.
// Add explicit metadata fields without changing the catalog's prices.
// Apply the same fields to order.model.js in production so every process sees them.
let orderFieldsInstalled = false;
function ensureOrderFields(Order) {
  if (orderFieldsInstalled) return;
  const additions = {};
  if (!Order.schema.path('source')) additions.source = {type:String,default:'website'};
  if (!Order.schema.path('pricingStatus')) additions.pricingStatus = {type:String,enum:['pending','confirmed'],default:'confirmed'};
  if (!Order.schema.path('priceConfirmed')) additions.priceConfirmed = {type:Boolean,default:true};
  if (Object.keys(additions).length) Order.schema.add(additions);
  orderFieldsInstalled = true;
}
function orderReference() {
  return `WZ-${new Date().getFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}
const text = v => typeof v==='string' ? v.trim() : '';
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const colorName = c => typeof c?.colorName==='string' ? c.colorName : (c?.colorName?.fr || c?.name?.fr || c?.name?.ar || c?.name || '');
const money = n => Math.round(Number(n)*100)/100;
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
const errorHandler=(err,res)=>{
  console.error('[AI checkout]', { name: err?.name, code: err?.code, message: err?.message, status: err?.status, stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined });
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  res.status(status).json({
    error: status < 500 ? err.message : 'Erreur interne du service de commande.',
    code: err?.code || (status === 422 ? 'CATALOG_VALIDATION' : status === 409 ? 'STOCK_CONFLICT' : 'CHECKOUT_ERROR'),
    ...(err?.code === 'PRICE_ON_REQUEST' ? {productId:err.productId} : {})
  });
};
async function getQuote(body,Product) {
  const name=text(body.name), email=text(body.email).toLowerCase(),phone=text(body.phone);
  const address=body.address||{};
  const addr={street:text(address.street),city:text(address.city),state:text(address.state),zipcode:text(address.zipcode),country:'Tunisia'};
  if (!name || name.length>120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[0-9\s-]{8,20}$/.test(phone)) fail(400,'Vérifiez votre nom, e-mail et téléphone.');
  if (Object.values(addr).some(x=>!x || x.length>250)) fail(400,'Veuillez compléter votre adresse de livraison.');
  if (!Array.isArray(body.items) || body.items.length<1 || body.items.length>10) fail(400,'Veuillez sélectionner entre 1 et 10 produits.');
  const items=[], summaryItems=[];
  for (const item of body.items) {
    const id=text(item.productId),qty=Number(item.quantity);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Number.isInteger(qty) || qty<1 || qty>20) fail(400,'Produit ou quantité invalide.');
    // Product IDs may be a public reference or a MongoDB _id.
    // Never query _id with a non-ObjectId string.
    const lookup = [{ productId: id }];
    if (mongoose.isValidObjectId(id)) lookup.push({ _id: id });
    const product = await Product.findOne({ $or: lookup }).lean();
    if (!product) fail(400,`Produit indisponible : ${id}`);
    // Existing order.controller.js uses product.newPrice as the unit price and
    // requires at least one selected piece when the catalog has pieces.
    // Validate every selected piece against the live catalog, never browser prices.
    const catalogPieces = Array.isArray(product.pieces) ? product.pieces : [];
    const selectedInput = Array.isArray(item.selectedPieces) ? item.selectedPieces : [];
    if (selectedInput.length > 30) fail(400, 'Trop de pièces sélectionnées.');
    if (catalogPieces.length && !selectedInput.length) fail(422, `Choisissez au moins une pièce pour le produit ${id}.`);
    if (!catalogPieces.length && selectedInput.length) fail(422, `Ce produit ne propose pas de pièces personnalisables : ${id}.`);
    const pieceName = p => typeof p === 'string' ? p.trim() : (typeof p?.name === 'string' ? p.name.trim() : String(p?.name?.fr || p?.name?.ar || p?.title?.fr || p?.label?.fr || '').trim());
    const validPieces = catalogPieces.map(p => ({ key: String(p?._id || p?.key || pieceName(p)), name: pieceName(p) })).filter(p => p.name);
    const selectedPieces = [];
    const seenPieces = new Set();
    for (const requested of selectedInput) {
      const key = text(requested?.key);
      const name = text(requested?.name);
      const match = validPieces.find(p => (key && p.key === key) || (name && p.name === name));
      if (!match || seenPieces.has(match.key)) fail(422, `Pièce inconnue ou dupliquée pour le produit ${id}.`);
      const pieceQty = Number(requested.quantity ?? 1);
      if (!Number.isInteger(pieceQty) || pieceQty < 1 || pieceQty > 20) fail(422, 'Quantité de pièce invalide (1 à 20).');
      seenPieces.add(match.key);
      selectedPieces.push({ key: match.key, name: match.name, quantity: pieceQty });
    }
    const rawPrice = product.newPrice;
    const price = rawPrice === null || rawPrice === undefined || rawPrice === ''
      ? null : Number(rawPrice);
    const priced = price !== null && Number.isFinite(price) && price > 0;
    const colors=Array.isArray(product.colors)?product.colors:[];
    let selected=null;
    if(colors.length){
      const cid=text(item.colorId);
      if(!cid) fail(400,`Veuillez choisir une couleur pour le produit ${id}.`);
      selected=colors.find(c=>String(c._id)===cid);
      if(!selected) fail(400,`Couleur non disponible pour le produit ${id}.`);
    }
    const stock=Number(selected?selected.stock:product.stockQuantity);
    if(!Number.isFinite(stock)||stock<qty) fail(409,`Stock insuffisant pour le produit ${id}.`);
    const size=text(item.size);
    if(size.length>50) fail(400,'Taille invalide.');
    items.push({productId:id,quantity:qty,colorId:selected?String(selected._id):'',size,selectedPieces});
    summaryItems.push({productId:id,title:text(product.translations?.fr?.title)||text(product.title)||id,quantity:qty,category:product.category||'',subCategory:product.subCategory||'',pieceType:product.pieceType||product.typePiece||'',unitPrice:priced?money(price):null,pricePending:!priced,colorName:selected?String(colorName(selected)):null,size,selectedPieces});
  }
  const requiresPricing = summaryItems.some(i => i.pricePending);
  const subtotal = requiresPricing ? null : money(summaryItems.reduce((n,i)=>n+i.quantity*i.unitPrice,0));
  return {customer:{name,email,phone,address:addr},items,summary:{
    items:summaryItems,subtotal,shipping:0,total:subtotal,
    requiresPricing,currency:'TND',paymentMethod:'cod'
  }};
}
router.post('/quote',async(req,res)=>{
  try {
    const {Product}=await deps();
    const quote=await getQuote(req.body||{},Product);
    const token=crypto.randomBytes(32).toString('hex');
    await Draft.create({tokenHash:tokenHash(token),...quote,expiresAt:new Date(Date.now()+20*60*1000)});
    res.status(200).json({checkoutToken:token,summary:quote.summary});
  } catch(e){errorHandler(e,res);}
});
router.post('/confirm',async(req,res)=>{
  try {
    const token=text(req.body?.checkoutToken);
    if(!/^[a-f0-9]{64}$/.test(token)||req.body?.confirm!==true) fail(400,'Confirmation invalide.');
    const hash=tokenHash(token);
    let draft=await Draft.findOne({tokenHash:hash});
    if(!draft) fail(404,'Devis introuvable. Veuillez vérifier votre commande à nouveau.');
    if(draft.status==='completed') return res.json({success:true,orderId:draft.orderId,pendingPricing:!!draft.summary?.requiresPricing,status:draft.summary?.requiresPricing?'awaiting_price':'confirmed'});
    if(draft.status==='processing') return res.status(202).json({processing:true});
    if(draft.expiresAt<=new Date()) fail(410,'Ce devis a expiré. Veuillez le renouveler.');
    draft=await Draft.findOneAndUpdate({tokenHash:hash,status:'quoted'},{$set:{status:'processing'}},{new:true});
    if(!draft) return res.status(202).json({processing:true});
    const {Product,createOrder,Order}=await deps();
    // Revalidate price, variant and stock. Never trust browser-supplied totals.
    const latest=await getQuote({name:draft.customer.name,email:draft.customer.email,phone:draft.customer.phone,address:draft.customer.address,items:draft.items},Product);
    if(JSON.stringify(latest.summary)!==JSON.stringify(draft.summary)) {
      await Draft.updateOne({_id:draft._id,status:'processing'},{$set:{status:'failed',error:'Catalog changed'}});
      fail(409,'Le prix ou le stock a changé. Veuillez vérifier la commande à nouveau.');
    }
    if (latest.summary.requiresPricing) {
      // No fake sale or fabricated total. Order is visible to existing admin and tracking queries.
      // Stock is NOT deducted until Sabri validates a final price and fulfills the order.
      ensureOrderFields(Order);
      const products = [];
      for (const item of latest.items) {
        const lookup = [{productId:item.productId}];
        if (mongoose.isValidObjectId(item.productId)) lookup.push({_id:item.productId});
        const product = await Product.findOne({$or:lookup}).lean();
        if (!product) fail(409, 'Un produit est devenu indisponible.');
        const color = (product.colors || []).find(c => String(c._id) === item.colorId);
        const images = color?.images || [];
        products.push({
          productId:item.productId, quantity:item.quantity, size:item.size,
          title:text(product.translations?.fr?.title)||text(product.title)||item.productId,
          coverImage:product.coverImage||'',
          category:product.category||'', subCategory:product.subCategory||'',
          color:color?{colorName:colorName(color),image:images[0]||product.coverImage||'',images}:undefined,
          colorKey:color?`img:${images[0]||''}`:'',
          selectedPieces:item.selectedPieces.map(p=>({...p,price:null})),
          pieces:item.selectedPieces.map(p=>({...p,price:null})),
          unitPrice:null, price:null, newPrice:null
        });
      }
      // Derive the reference from the draft, so retries after a crash do not create duplicates.
      const reference = `WZ-${new Date(draft.createdAt).getFullYear()}-${draft._id.toString().slice(-10).toUpperCase()}`;
      try {
        let order = await Order.findOne({orderId:reference});
        if (!order) {
          order = await Order.findOneAndUpdate(
            {orderId:reference},
            {$setOnInsert:{
              orderId:reference, name:latest.customer.name,email:latest.customer.email,
              phone:latest.customer.phone,address:latest.customer.address,products,
              source:'am_hssin',pricingStatus:'pending',priceConfirmed:false,
              paymentMethod:'cod',payment:{method:'cod'},
              status:'تم تأكيد الطلب',isPaid:false,isDelivered:false,
              subtotal:null,shipping:null,total:null,totalPrice:null,
              totals:{subtotal:null,shipping:null,total:null},productProgress:{}
            }},
            {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true}
          );
        }
        await Draft.updateOne({_id:draft._id,status:'processing'},{$set:{status:'completed',orderId:order.orderId}});
        return res.status(201).json({success:true,orderId:order.orderId,
          pendingPricing:true,status:'awaiting_price',summary:latest.summary,
          trackingUrl:`/order-track/${encodeURIComponent(order.orderId)}`});
      } catch (error) {
        console.error('[AI checkout] Order write uncertain',draft._id.toString(),error.message);
        return res.status(202).json({processing:true});
      }
    }
    const products=[];
    for(const item of latest.items){
      const lookup = [{ productId: item.productId }];
      if (mongoose.isValidObjectId(item.productId)) lookup.push({ _id: item.productId });
      const product = await Product.findOne({ $or: lookup }).lean();
      const color=(product.colors||[]).find(c=>String(c._id)===item.colorId);
      const images=color?.images||[];
      products.push({productId:item.productId,quantity:item.quantity,size:item.size,
        color:color?{colorName:colorName(color),image:images[0]||product.coverImage||'',images}:undefined,
        colorKey:color?`img:${images[0]||''}`:'',selectedPieces:item.selectedPieces,pieces:item.selectedPieces});
    }
    // Existing controller owns the order creation/stock updates and notifications.
    // Unique token claim prevents concurrent confirms for this draft.
    const captured={status:200,data:null};
    const response={status(code){captured.status=code;return this;},json(data){captured.data=data;return this;},send(data){captured.data=data;return this;}};
    try {
      await createOrder({body:{...draft.customer,products,totals:{shipping:0}}},response);
    } catch(err) {
      // Keep processing for manual reconciliation when creation outcome is uncertain.
      console.error('[AI checkout] Order outcome uncertain',draft._id.toString(),err.message);
      return res.status(202).json({processing:true});
    }
    if(captured.status>=400||!captured.data?.order?.orderId){
      await Draft.updateOne({_id:draft._id,status:'processing'},{$set:{status:'failed',error:'Order controller rejected checkout'}});
      return res.status(captured.status>=400?captured.status:500).json({error:captured.data?.message||'Commande refusée. Veuillez recommencer la vérification.'});
    }
    const orderId=String(captured.data.order.orderId);
    await Draft.updateOne({_id:draft._id,status:'processing'},{$set:{status:'completed',orderId}});
    res.status(201).json({success:true,orderId,trackingUrl:`/order-track/${encodeURIComponent(orderId)}`});
  }catch(e){errorHandler(e,res);}
});

// A completed, server-created checkout token authorizes notification for its own order.
// Never accept recipient, price, products, or order ID from the browser.
router.post('/notify-email', async (req, res) => {
  let claimed = null;
  try {
    const token = text(req.body?.checkoutToken);
    if (!/^[a-f0-9]{64}$/.test(token)) fail(400, 'Jeton de commande invalide.');
    const hash = tokenHash(token);
    const existing = await Draft.findOne({ tokenHash: hash }).lean();
    if (!existing || existing.status !== 'completed' || !existing.orderId) {
      fail(403, 'La commande doit être enregistrée avant notification.');
    }
    if (existing.emailNotificationStatus === 'sent') {
      return res.json({ success: true, emailSent: true, alreadySent: true });
    }
    // Prevent simultaneous duplicate submissions. A stale claim can be retried after 2 minutes.
    const stale = new Date(Date.now() - 2 * 60 * 1000);
    claimed = await Draft.findOneAndUpdate({
      _id: existing._id, status: 'completed',
      $or: [
        { emailNotificationStatus: { $exists: false } },
        { emailNotificationStatus: 'failed' },
        { emailNotificationStatus: 'sending', emailNotificationClaimedAt: { $lt: stale } },
      ],
    }, { $set: { emailNotificationStatus: 'sending', emailNotificationClaimedAt: new Date() } }, { new: true });
    if (!claimed) return res.status(202).json({ processing: true, emailSent: false });

    const { Order } = await deps();
    const order = await Order.findOne({ orderId: claimed.orderId }).lean();
    if (!order) fail(404, 'Commande enregistrée introuvable.');

    // Use the existing professional OVH SMTP service, not the public contact form.
    const mailModule = await importModule('../services/mail.service.js');
    const sendProfessionalMail =
      mailModule.sendProfessionalMail ||
      mailModule.default?.sendProfessionalMail ||
      (typeof mailModule.default === 'function' ? mailModule.default : null);
    if (typeof sendProfessionalMail !== 'function') {
      throw new Error('sendProfessionalMail absent de mail.service.js');
    }
    const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const customer = claimed.customer || {};
    const addr = customer.address || {};
    const summary = claimed.summary || {};
    const lines = (Array.isArray(summary.items) ? summary.items : []).map((p, i) => {
      const pieces = Array.isArray(p.selectedPieces) ? p.selectedPieces.map(x => `${x.name} x${x.quantity}`).join(', ') : '';
      return `${i+1}. ${p.title || p.productId} | Qté: ${p.quantity} | Couleur: ${p.colorName || '-'} | Taille: ${p.size || '-'} | Pièces: ${pieces || '-'} | Prix unitaire: ${p.pricePending ? 'à confirmer' : p.unitPrice + ' TND'}`;
    });
    const addressText = [addr.street, addr.city, addr.state, addr.zipcode, addr.country].filter(Boolean).join(', ');
    const details = [
      `Commande: ${claimed.orderId}`,
      `Client: ${customer.name || ''}`,
      `E-mail client: ${customer.email || ''}`,
      `Téléphone: ${customer.phone || ''}`,
      `Adresse: ${addressText}`,
      `Paiement: à la livraison`,
      `Statut du prix: ${summary.requiresPricing ? 'à confirmer' : 'confirmé'}`,
      `Total: ${summary.requiresPricing || summary.total == null ? 'à confirmer' : summary.total + ' TND'}`,
      '', 'Produits:', ...lines,
    ].join('\n');
    // Trim whitespace; avoid sending to an unconfigured address without operator approval.
    const recipient = String(process.env.MAIL_TO || '').trim();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      const invalidRecipient = new Error('MAIL_TO missing or invalid: set MAIL_TO to the verified shop inbox in backend environment variables');
      invalidRecipient.code = 'MAIL_TO_INVALID';
      throw invalidRecipient;
    }
    const mailResult = await sendProfessionalMail({
      to: recipient,
      replyTo: customer.email,
      subject: `[Am Hssin] Commande ${claimed.orderId}${summary.requiresPricing ? ' — prix à confirmer' : ''}`,
      text: details,
      html: `<h2>Nouvelle commande Am Hssin</h2><pre style="font:14px/1.6 Arial,sans-serif;white-space:pre-wrap">${escape(details)}</pre>`,
    });
    if (!mailResult || (Array.isArray(mailResult.rejected) && mailResult.rejected.length) || (Array.isArray(mailResult.accepted) && !mailResult.accepted.length)) {
      const rejection = new Error('SMTP did not accept the notification recipient');
      rejection.code = 'SMTP_RECIPIENT_REJECTED';
      throw rejection;
    }
    await Draft.updateOne({ _id: claimed._id, emailNotificationStatus: 'sending' }, {
      $set: { emailNotificationStatus: 'sent', emailNotificationSentAt: new Date() }
    });
    console.info('[Am Hssin] notify-email accepted by SMTP', { orderId: claimed.orderId, messageId: mailResult.messageId });
    return res.json({ success: true, emailSent: true });
  } catch (err) {
    if (claimed) await Draft.updateOne({ _id: claimed._id, emailNotificationStatus: 'sending' }, {
      $set: { emailNotificationStatus: 'failed' }
    }).catch(() => {});
    console.error('[Am Hssin] notify-email failed', {
      code: err?.code || 'UNKNOWN',
      name: err?.name,
      responseCode: err?.responseCode,
      command: err?.command,
      message: err?.message,
    });
    if (res.headersSent) return;
    if (err?.code === 'MAIL_TO_INVALID') return res.status(503).json({ success: false, emailSent: false, code: 'MAIL_TO_INVALID', error: 'Commande enregistrée. L’adresse e-mail de notification de la boutique doit être configurée sur le serveur.' });
    if (err?.status && err.status < 500) return errorHandler(err, res);
    return res.status(503).json({
      success: false,
      emailSent: false,
      code: 'EMAIL_NOTIFICATION_UNAVAILABLE',
      error: 'Commande enregistrée. La notification e-mail est indisponible ; réessayez uniquement l’envoi e-mail.',
    });
  }
});

module.exports=router;
