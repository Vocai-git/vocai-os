'use strict';
// Entirely fictional financial data, safe for a public repository.
const baseline = {
 cutoff:'2026-10-05', description:'Ejemplo ficticio para pruebas',
 cash:{bank:500000,cash:100000}, operating:{santi:200000,agus:10000},
 groups:{startup:{santi:1000000,agus:600000,settled:0},capital:{santi:200000,agus:0,settled:0}},
};
const records = [
 {data:{kind:'expense',title:'Compra de prueba',amount:3000,date:'2026-10-01',payments:[]}},
 {data:{kind:'income',title:'Venta de prueba',amount:120000,date:'2026-10-01',payments:[]}},
];
module.exports={baseline,records};
