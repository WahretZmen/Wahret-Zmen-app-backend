"use strict";
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../admin/admin.model.js');
const clean = v => typeof v === 'string' ? v.trim() : '';
const secret = () => clean(process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || process.env.JWT_SECRET_TOKEN);
const fail = (res,status,code,message) => res.status(status).set('Cache-Control','no-store').json({success:false,code,message});
async function verifyAdminToken(req,res,next) {
  const key=secret();
  if(!key) return fail(res,503,'ADMIN_AUTH_UNAVAILABLE','Authentication unavailable');
  const header=clean(req.get('authorization'));
  const match=/^Bearer\s+(\S+)$/i.exec(header);
  // Bearer-only: prevents cookie-based CSRF on administrative mutation routes.
  if(!match) return fail(res,401,'ADMIN_TOKEN_MISSING','Admin token required');
  let claims;
  try { claims=jwt.verify(match[1],key,{algorithms:['HS256'],clockTolerance:5}); }
  catch(e) { return fail(res,401,e.name==='TokenExpiredError'?'ADMIN_TOKEN_EXPIRED':'ADMIN_TOKEN_INVALID','Invalid or expired admin session'); }
  if(!claims || claims.role!=='admin' || !mongoose.isValidObjectId(claims.id)) return fail(res,403,'ADMIN_ACCESS_DENIED','Administrator access required');
  try {
    const record=await Admin.findById(claims.id).select('_id username email role isActive').lean();
    if(!record || record.role!=='admin' || record.isActive===false) return fail(res,403,'ADMIN_ACCESS_DENIED','Administrator account unavailable');
    const admin={id:String(record._id),_id:String(record._id),username:record.username,email:record.email,role:'admin'};
    req.admin=admin;req.adminId=admin.id;req.user=admin;req.auth={adminId:admin.id,role:'admin'};
    return next();
  } catch(e) { console.error('[Admin auth] database check failed');return fail(res,503,'ADMIN_AUTH_UNAVAILABLE','Authentication temporarily unavailable'); }
}
module.exports=verifyAdminToken;
module.exports.verifyAdminToken=verifyAdminToken;
module.exports.default=verifyAdminToken;
