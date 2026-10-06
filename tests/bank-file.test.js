'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{deflateRawSync}=require('node:zlib');
const {parse,LIMITS}=require('../lib/bank-file');
// Small synthetic ZIP/XLSX fixtures, generated in memory with no external files.
function zip(entries){
 let offset=0;const local=[],directory=[];
 for(const [filename,content] of Object.entries(entries)){
  const name=Buffer.from(filename),raw=Buffer.from(content),data=deflateRawSync(raw);let crc=0xffffffff;
  for(const byte of raw){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  local.push(header,name,data);directory.push(central,name);offset+=header.length+name.length+data.length;
 }
 const end=Buffer.alloc(22),central=Buffer.concat(directory);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,central,end]);
}
function xlsx(sheet){
 const day=(Date.UTC(2026,9,5)-Date.UTC(1899,11,30))/86400000;
 return zip({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Banco de prueba" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml':sheet||`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Concepto</t></is></c><c r="C1" t="inlineStr"><is><t>Importe</t></is></c></row><row r="2"><c r="A2" s="1"><v>${day}</v></c><c r="B2" t="inlineStr"><is><t>Compra ficticia</t></is></c><c r="C2"><v>-12.34</v></c></row><row r="3"><c r="A3" s="1"><v>${day+1}</v></c><c r="B3" t="inlineStr"><is><t>Cached formula, never evaluated</t></is></c><c r="C3"><f>1+1</f><v>999</v></c></row></sheetData></worksheet>`,
 });
}
test('CSV preserves BOM, decimal commas, quoted separators, escaped quotes and multiline descriptions',async()=>{
 const sheets=await parse(Buffer.from('\uFEFFFecha;Concepto;Importe\r\n05/10/2026;"Café; \"\"oficina\"\"\nsegundo renglón";"-12,34"\r\n'),'bank.csv');
 assert.deepEqual(sheets[0].rows,[['Fecha','Concepto','Importe'],['05/10/2026','Café; "oficina"\nsegundo renglón','-12,34']]);
});
test('CSV reads tabs, comma exports, Excel delimiter hints and Windows-1252 accents',async()=>{
 assert.deepEqual((await parse(Buffer.from('Date\tDescription\tAmount\n2026-10-05\tText\t12.00'),'bank.csv'))[0].rows[1],['2026-10-05','Text','12.00']);
 assert.deepEqual((await parse(Buffer.from('Date,Description,Amount\n2026-10-05,"Text, quoted",12.00'),'bank.csv'))[0].rows[1],['2026-10-05','Text, quoted','12.00']);
 assert.equal((await parse(Buffer.from('sep=;\nFecha;Concepto;Importe\n05/10/2026;Caf\xe9;12,00','latin1'),'bank.csv'))[0].rows[1][1],'Café');
});
test('CSV formula strings are ordinary data and malformed or binary inputs fail explicitly',async()=>{
 assert.equal((await parse(Buffer.from('a;b\n1;=SUM(A1)'),'bank.csv'))[0].rows[1][1],'=SUM(A1)');
 for(const input of [Buffer.from('a;b\n1;"unterminated'),Buffer.from('a;b\n1;"closed"bad'),Buffer.from('a\0b')])await assert.rejects(parse(input,'bank.csv'),e=>e.status===400);
});
test('reader rejects unsupported types and its byte, row and column limits',async()=>{
 for(const [content,name] of [[Buffer.from('x'),'bank.xls'],[Buffer.from('%PDF'),'bank.pdf'],[Buffer.from('x'),'bank.xlsx'],[Buffer.alloc(0),'bank.csv'],[Buffer.alloc(LIMITS.bytes+1),'bank.csv'],[Buffer.from('x\n'.repeat(5001)),'bank.csv'],[Buffer.from(Array(101).fill('x').join(';')),'bank.csv']])await assert.rejects(parse(content,name),e=>e.status===400);
});
test('XLSX is parsed in a bounded worker, with ISO dates and cached formula values only',async()=>{
 const sheets=await parse(xlsx(),'bank.xlsx');
 assert.equal(sheets[0].name,'Banco de prueba');
 assert.deepEqual(sheets[0].rows[1],['2026-10-05','Compra ficticia',-12.34]);
 assert.equal(sheets[0].rows[2][2],999);
});
test('XLSX dimensions and inflated size are rejected before a large allocation',async()=>{
 await assert.rejects(parse(xlsx('<worksheet><dimension ref="A1:XFD1048576"/><sheetData/></worksheet>'),'bank.xlsx'),e=>e.status===400);
 await assert.rejects(parse(xlsx('x'.repeat(8*1024*1024+1)),'bank.xlsx'),e=>e.status===400);
 await assert.rejects(parse(Buffer.from('PK\x03\x04broken'),'bank.xlsx'),e=>e.status===400);
});
test('only two XLSX workers run concurrently and the capacity is released afterwards',async()=>{
 const input=xlsx(),a=parse(input,'a.xlsx'),b=parse(input,'b.xlsx');
 await assert.rejects(parse(input,'c.xlsx'),e=>e.status===429);
 await Promise.all([a,b]);
 assert.equal((await parse(input,'later.xlsx')).length,1);
});
