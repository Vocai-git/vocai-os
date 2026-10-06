/* Optional amount calculator shared by the form and server. Amounts are cents,
 * rates are basis points (21% = 2100). It never infers tax on older records. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.FinanceTax=factory();
})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const MAX_AMOUNT=1000000000;
 function check(ok,message){if(!ok){const error=new Error(message);error.status=400;error.code='INVALID_VAT';throw error;}}
 function round(numerator,denominator){return (numerator+denominator/2n)/denominator;}
 function calculate(inputCents,mode,rateBps){
  check(['none','included','added'].includes(mode),'Selecciona cómo se aplica el IVA');
  check(Number.isSafeInteger(inputCents)&&inputCents>0&&inputCents<=MAX_AMOUNT,'El importe para calcular IVA debe ser positivo, en céntimos enteros y dentro del límite');
  check(Number.isSafeInteger(rateBps)&&rateBps>=0&&rateBps<=10000,'El porcentaje de IVA debe estar entre 0 y 100, con un máximo de dos decimales');
  check(mode!=='none'||rateBps===0,'Sin añadir IVA requiere un porcentaje de cero');
  const input=BigInt(inputCents),rate=BigInt(rateBps),unit=10000n;
  let base=input,tax=0n,total=input;
  if(mode==='included'){base=round(input*unit,unit+rate);tax=input-base;}
  if(mode==='added'){tax=round(input*rate,unit);total=input+tax;}
  check(total<=BigInt(MAX_AMOUNT),'El total con IVA supera el importe máximo permitido');
  return {mode,input:inputCents,rate:rateBps,base:Number(base),tax:Number(tax),total:Number(total)};
 }
 return {calculate};
});
