"use strict";
const express=require('express');
const jwt=require('jsonwebtoken');
const crypto=require('node:crypto');
const Admin=require('./admin.model.js');
const router=express.Router();
const env=k=>String(process.env[k]||'').trim();
const secret=()=>env('JWT_SECRET_KEY')||env('JWT_SECRET')||env('JWT_SECRET_TOKEN');
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// This endpoint must additionally have a distributed rate limiter at the edge.
router.post('/',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const key=secret();if(!key)return res.status(503).json({success:false,message:'Authentication unavailable'});
 const username=typeof req.body?.username==='string'?req.body.username.trim():'';
 const password=typeof req.body?.password==='string'?req.body.password:'';
 if(!username||!password||username.length>254||password.length>1024)return res.status(400).json({success:false,message:'Invalid credentials'});
 try {
  const escaped=escapeRegex(username);
  const admin=await Admin.findOne({role:'admin',$or:[{username:{$regex:`^${escaped}$`,$options:'i'}},{email:{$regex:`^${escaped}$`,$options:'i'}}]}).select('+password');
  // Legacy comparePassword is retained; migrate plaintext passwords to bcrypt/argon2.
  const valid=admin && typeof admin.comparePassword==='function' && await admin.comparePassword(password);
  if(!valid || admin.isActive===false) {
   // Avoid revealing whether an account exists or is disabled.
   return res.status(401).json({success:false,message:'Invalid credentials'});
  }
  const token=jwt.sign({id:String(admin._id),role:'admin',username:admin.username,email:admin.email},key,{algorithm:'HS256',expiresIn:'1h',jwtid:crypto.randomUUID()});
  return res.json({success:true,token,expiresIn:3600,admin:{id:String(admin._id),username:admin.username,email:admin.email,role:'admin'}});
 }catch(e){console.error('[Admin login] failed');return res.status(500).json({success:false,message:'Authentication failed'});}
});
module.exports=router;
