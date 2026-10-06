'use strict';
const express=require('express');
const {supabase}=require('../config/supabase');
const telegram=require('../lib/telegram-documents');
const router=express.Router(),receiver=telegram.createReceiver({db:supabase});
// Mount before the application's global JSON parser. Reject untrusted requests
// before reading their body, and never accept a Telegram token in a URL/body.
router.post('/webhook',(req,res,next)=>{
 const config=telegram.configuration();
 if(!telegram.enabled()||!config.configured)return res.status(503).json({error:'La recepción de Telegram está desactivada'});
 if(!telegram.verifySecret(req.headers['x-telegram-bot-api-secret-token'],config.secret))return res.status(401).json({error:'Solicitud de Telegram no autorizada'});
 if(!req.is('application/json'))return res.status(415).json({error:'Se requiere una actualización JSON'});
 next();
},express.json({limit:'100kb'}),(req,res,next)=>receiver.receive(req.body).then(result=>res.json(result)).catch(next));
router.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:error.status||500;
 res.status(status).json({error:status===413?'La actualización supera el tamaño permitido':status===400&&error.type?'Actualización JSON no válida':error.status?error.message:'No se pudo recibir el documento'});
});
module.exports=router;
