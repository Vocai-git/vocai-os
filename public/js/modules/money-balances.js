/* A balance is explainable only when its components lead back to records. */
const MONEY_BALANCE_BUCKETS = {
 expenses: {title:'Gastos pagados por Santiago',detail:'Dinero personal usado para pagar gastos del negocio.',sign:1,tone:'expense'},
 receipts: {title:'Cobros que recibió Santiago',detail:'Dinero de clientes que recibió o le entregaron y que ya descuenta sus adelantos.',sign:-1,tone:'income'},
 assigned: {title:'Ingresos de Ana asignados a Santiago',detail:'Derecho de cobro acordado para compensar adelantos. No es dinero cobrado.',sign:-1,tone:'assignment'},
 advances: {title:'Dinero adelantado a VOCAI',detail:'Transferencias personales para cubrir gastos corrientes.',sign:1,tone:'expense'},
 refunds: {title:'Devoluciones de VOCAI',detail:'Dinero que VOCAI ya devolvió a Santiago.',sign:-1,tone:'income'}
};
function moneyBalanceModel(){return FinanceBalances.evidence(moneyState.data.records,moneyState.data.baseline,moneyState.data.summary);}
function moneyBalanceBucket(model,key){
 const a=model.opening[key]||{items:[],total:0},b=model.changes[key]||{items:[],total:0};
 return {items:[...a.items,...b.items],total:a.total+b.total};
}
function moneyBalanceDate(date,monthOnly=false){
 if(!date)return 'Sin fecha registrada';
 const value=new Date(String(date).slice(0,7)+'-01T12:00:00');
 if(monthOnly||String(date).length===7)return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(value);
 return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00'));
}
function moneyBalanceLine(model,key){
 const bucket=moneyBalanceBucket(model,key),meta=MONEY_BALANCE_BUCKETS[key];
 return `<button class="balance-step ${meta.tone}" onclick="moneyBalanceDetail('${key}')" aria-label="Ver ${moneyEsc(meta.title)}"><span class="balance-sign" aria-hidden="true">${meta.sign>0?'+':'−'}</span><span class="balance-step-name"><strong>${meta.title}</strong><small>${key==='assigned'?'Compensación acordada · sin cobro real':bucket.items.length+' movimientos · ver detalle'}</small></span><b>${moneyEuro(bucket.total)}</b><span class="balance-arrow" aria-hidden="true">↗</span></button>`;
}
function moneyBalancesHTML(s){
 const model=moneyBalanceModel(),baseline=moneyState.data.baseline,operating=s.operating.santi;
 const personal=Object.values(s.groups).reduce((sum,g)=>sum+g.agus_to_santi,0);
 const totals=Object.fromEntries(Object.keys(MONEY_BALANCE_BUCKETS).map(k=>[k,moneyBalanceBucket(model,k).total]));
 const before=totals.expenses+totals.advances-totals.receipts-totals.refunds;
 const latest=moneyState.data.records.filter(r=>!r.voided&&!r.included_in_opening).flatMap(r=>['transfer','contribution','settlement'].includes(r.data.kind)?[r.data.date]:(r.data.payments||[]).map(p=>p.date)).filter(Boolean).sort().pop();
 const asOf=latest&&latest>baseline.cutoff?latest:baseline.cutoff;
 const gaps=model.gaps;
 return `<section class="balance-workspace"><header class="balance-heading"><div><h2>Saldos</h2><p>Quién debe a quién, de dónde viene y qué ya se descontó.</p></div><span class="balance-date">Acumulado al ${moneyBalanceDate(asOf)}</span></header>
 <p class="balance-context">Según los movimientos y acuerdos revisados con Santiago${moneyState.data.review?' · para revisar con Agustín':''}.</p>
 <div class="balance-layout"><article class="balance-card balance-company"><header><p class="money-eyebrow">GASTOS DEL NEGOCIO</p><h3>${operating>=0?'VOCAI debe a Santiago':'Santiago debe a VOCAI'}</h3><strong class="balance-total">${moneyEuro(Math.abs(operating))}</strong><p>Saldo pendiente después de cobros y compensaciones.</p></header>
 <div class="balance-calculation"><h4>Cómo se llega a este saldo</h4>${moneyBalanceLine(model,'expenses')}${totals.advances?moneyBalanceLine(model,'advances'):''}${moneyBalanceLine(model,'receipts')}${totals.refunds?moneyBalanceLine(model,'refunds'):''}
 <div class="balance-subtotal"><span>Antes de compensar Ana</span><b>${moneyEuro(before)}</b></div>${moneyBalanceLine(model,'assigned')}
 <div class="balance-result"><strong>${model.current.verified?(model.current.reconstructed<0?'Santiago debe a VOCAI':model.current.reconstructed===0?'Cuenta saldada':'Queda por devolver'):'Saldo explicado por estos movimientos'}</strong><b>${moneyEuro(model.current.verified?Math.abs(model.current.reconstructed):model.current.reconstructed)}</b></div>
 ${!gaps.length?'<p class="balance-check">✓ La suma de los movimientos coincide con el saldo.</p>':`<div class="balance-gap" role="status">${gaps.map(g=>`<p>${moneyEsc(g.message)}${Number.isFinite(g.amount)?' Diferencia: '+moneyEuro(Math.abs(g.amount))+'.':''}</p>`).join('')}<p>El saldo guardado se conserva; no se ha creado ningún ajuste para hacerlo coincidir.</p></div>`}</div>
 <div class="balance-ana-note"><strong>Qué significa la compensación de Ana</strong><p>Ana todavía no pagó. Se acordó asignar su cobro a Santiago para reducir lo que VOCAI le debe. Santiago lleva esa cuenta con Ana por separado. Cuando ella pague, este saldo no se vuelve a descontar.</p></div></article>
 <aside class="balance-sidebar"><article class="balance-card balance-personal"><header><p class="money-eyebrow">ENTRE SOCIOS · REPARTO 50 / 50</p><h3>${personal>=0?'Agustín debe a Santiago':'Santiago debe a Agustín'}</h3><strong class="balance-total">${moneyEuro(Math.abs(personal))}</strong><span class="balance-pending">${personal?'Pendiente':'Saldado'}</span></header>
 <p class="balance-personal-note">Compensación personal por haber aportado cantidades distintas.</p>
 ${Object.entries(s.groups).map(([key,g])=>`<details class="balance-contribution"><summary><span>${moneyEsc(MONEY_GROUPS[key]||key)}</span><b>${moneyEuro(Math.abs(g.agus_to_santi))}</b></summary><div><p><span>Santiago aportó</span><b>${moneyEuro(g.santi)}</b></p><p><span>Agustín aportó</span><b>${moneyEuro(g.agus)}</b></p><p><span>Total aportado</span><b>${moneyEuro(g.total)}</b></p><p><span>La mitad de cada uno</span><b>${moneyEuro(g.each)}</b></p>${g.settled?`<p><span>Compensaciones entre socios</span><b>${moneyEuro(g.settled)}</b></p>`:''}<p class="balance-contribution-result">${g.agus_to_santi>=0?'Agustín → Santiago':'Santiago → Agustín'}: ${moneyEuro(Math.abs(g.agus_to_santi))}</p></div></details>`).join('')}
 <p class="balance-separation">Estos aportes se equilibran entre socios. No se suman a la deuda operativa de VOCAI.</p><button class="balance-link" onclick="moneyView('contributions')">Ver inversión y aportes <span aria-hidden="true">↗</span></button></article>
 <article class="balance-card balance-other"><p class="money-eyebrow">OTRO SALDO DEL NEGOCIO</p><h3>${s.operating.agus>=0?'VOCAI debe a Agustín':'Agustín debe a VOCAI'}</h3><strong>${moneyEuro(Math.abs(s.operating.agus))}</strong><p>Se lleva por separado, sin descontarlo de su deuda personal con Santiago.</p><button class="balance-link" onclick="moneyBalanceOther()">Ver detalle <span aria-hidden="true">↗</span></button></article></aside></div>
 <section id="balanceDetail" class="balance-detail" hidden aria-label="Detalle del cálculo"></section>
 <p class="balance-evidence-note">El registro original y el comprobante son cosas distintas. En cada detalle se indica qué información está disponible.</p>
 ${moneyState.data.review?'':'<button class="btn btn-primary" onclick="moneyForm(\'transfer\')">Registrar devolución de VOCAI</button>'}</section>`;
}
function moneyBalanceDetail(key){
 if(!MONEY_BALANCE_BUCKETS[key])return;
 moneyState.balanceDetail=key;moneyState.balanceSearch='';
 const meta=MONEY_BALANCE_BUCKETS[key],bucket=moneyBalanceBucket(moneyBalanceModel(),key),el=document.getElementById('balanceDetail');
 el.hidden=false;
 el.innerHTML=`<header class="balance-detail-heading"><div><p class="money-eyebrow">MOVIMIENTOS QUE EXPLICAN EL SALDO</p><h3>${meta.title}</h3><p>${meta.detail}</p></div><button class="balance-close" onclick="document.getElementById('balanceDetail').hidden=true" aria-label="Cerrar detalle">×</button></header><div class="balance-detail-tools"><label>Buscar movimiento<input class="form-input" type="search" placeholder="Concepto o proveedor…" oninput="moneyState.balanceSearch=this.value;moneyBalanceRows()"></label><strong>${meta.sign>0?'+':'−'} ${moneyEuro(bucket.total)}</strong></div><p class="balance-detail-hint">${key==='assigned'?'Agrupado por mes del servicio. La asignación reduce la deuda, pero no acredita un cobro.':'Agrupado por mes del pago o cobro. Cuando falta el día real, se identifica como mes registrado.'}</p><div id="balanceDetailRows"></div>`;
 moneyBalanceRows();el.scrollIntoView({behavior:'smooth',block:'start'});
}
function moneyBalanceRows(){
 const key=moneyState.balanceDetail,bucket=moneyBalanceBucket(moneyBalanceModel(),key),query=(moneyState.balanceSearch||'').trim().toLocaleLowerCase('es');
 const items=bucket.items.filter(item=>[item.title,moneyRecord(item.id)?.data.party,item.date].join(' ').toLocaleLowerCase('es').includes(query));
 const groups=new Map();
 for(const item of items){const month=item.date?item.date.slice(0,7):'';if(!groups.has(month))groups.set(month,[]);groups.get(month).push(item);}
 document.getElementById('balanceDetailRows').innerHTML=`<p class="balance-visible-total">${items.length} movimientos${query?' encontrados':''} · ${moneyEuro(items.reduce((sum,item)=>sum+item.amount,0))}</p>`+[...groups.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([month,rows])=>`<details class="balance-month" ${query?'open':''}><summary><span>${moneyBalanceDate(month?month+'-01':null,true)}<small>${rows.length} movimientos</small></span><b>${moneyEuro(rows.reduce((sum,item)=>sum+item.amount,0))}</b><i aria-hidden="true">⌄</i></summary><div>${rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(item=>{const row=moneyRecord(item.id),files=(moneyState.data.files||[]).filter(f=>f.record_id===item.id);return `<button class="balance-record" data-record="${moneyEsc(item.id)}" onclick="moneyBalanceRecord(this.dataset.record)"><span><strong>${moneyEsc(item.title)}</strong><small>${key==='assigned'?'Asignación · sin cobro':item.estimated?'Mes registrado · día real sin documentar':moneyBalanceDate(item.date)}${row?.data.period_start?' · Servicio '+moneyEsc(row.data.period_start.slice(0,7)):''}</small><small>${files.length?'Comprobante adjunto':'Sin comprobante adjunto en V2'}${row?.data.history?.sources?.length?' · registro original disponible':''}</small></span><b>${moneyEuro(item.amount)}</b><i aria-hidden="true">↗</i></button>`;}).join('')}</div></details>`).join('')+(items.length?'':'<p class="balance-detail-hint">No hay movimientos con esa búsqueda.</p>');
}
function moneyBalanceRecord(id){
 const row=moneyRecord(id);if(!row)return;
 const d=row.data,h=d.history||{},key=moneyState.balanceDetail,meta=MONEY_BALANCE_BUCKETS[key],items=moneyBalanceBucket(moneyBalanceModel(),key).items.filter(item=>item.id===id),amount=items.reduce((sum,item)=>sum+item.amount,0),files=(moneyState.data.files||[]).filter(file=>file.record_id===id);
 createModal('moneyBalanceRecord','Detalle del saldo',`<div class="balance-record-detail"><p class="money-eyebrow">${moneyEsc(meta.title)}</p><strong>${meta.sign>0?'+':'−'} ${moneyEuro(amount)}</strong><p>${meta.sign>0?'Aumenta':'Reduce'} lo que VOCAI debe a Santiago.</p><dl><dt>Concepto</dt><dd>${moneyEsc(d.title)}</dd>${d.party?`<dt>Cliente / proveedor</dt><dd>${moneyEsc(d.party)}</dd>`:''}${d.period_start?`<dt>Período del servicio</dt><dd>${moneyEsc(d.period_start)} al ${moneyEsc(d.period_end||d.period_start)}</dd>`:''}<dt>${key==='assigned'?'Asignación':'Pago / cobro'}</dt><dd>${items.map(item=>`${moneyEuro(item.amount)} · ${item.estimated?moneyBalanceDate(item.date,true)+' (mes registrado)':moneyBalanceDate(item.date)}`).join('<br>')}</dd><dt>Fundamento</dt><dd>${moneyEsc(h.reason||d.notes||'Movimiento registrado en V2.')}</dd><dt>Comprobante</dt><dd>${files.length?files.map(file=>`<button class="balance-link" data-file="${moneyEsc(file.id)}" onclick="moneyFile(this.dataset.file)">${moneyEsc(file.name||'Abrir adjunto')}</button>`).join(''):'Sin comprobante adjunto en V2. El registro por sí solo no es un justificante bancario.'}</dd></dl>${key==='assigned'?'<p class="balance-modal-note">No se ha registrado un pago de Ana. Su liquidación con Santiago se lleva por separado y no vuelve a descontarse del saldo de VOCAI.</p>':''}${items.some(item=>item.basis==='registered_month')?'<p class="balance-modal-note">El pago se confirmó al revisar el histórico con Santiago. Se conserva el mes del registro porque no consta el día efectivo.</p>':''}${(h.sources||[]).map(source=>`<details class="balance-source"><summary>Ver registro original</summary><pre class="money-json">${moneyEsc(JSON.stringify(source.original,null,2))}</pre></details>`).join('')}</div>`);
}
function moneyBalanceOther(){
 const b=moneyState.data.baseline,current=moneyState.data.summary.operating.agus;
 const originals=moneyState.data.records.filter(r=>!r.voided&&r.included_in_opening&&r.data.kind==='expense'&&(r.data.payments||[]).some(p=>p.account==='agus'));
 const changes=[];
 for(const r of moneyState.data.records.filter(r=>!r.voided&&!r.included_in_opening)){
  const d=r.data;
  if(['expense','income'].includes(d.kind))for(const p of d.payments||[])if(p.account==='agus')changes.push({id:r.id,title:d.title,date:p.date,delta:p.amount*(d.kind==='expense'?1:-1)});
  if(d.kind==='transfer'&&(d.source==='agus'||d.target==='agus'))changes.push({id:r.id,title:d.title,date:d.date,delta:d.amount*(d.source==='agus'?1:-1)});
 }
 createModal('moneyBalanceOther','VOCAI con Agustín',`<div class="balance-record-detail"><p>${current>=0?'VOCAI debe a Agustín':'Agustín debe a VOCAI'}</p><strong>${moneyEuro(Math.abs(current))}</strong><p>Saldo de partida al ${moneyBalanceDate(b.cutoff)}: <b>${moneyEuro(b.operating.agus)}</b>.</p>${(b.explanation||[]).filter(line=>/Digi|Internet|Agust[ií]n/i.test(line)).map(line=>`<p>${moneyEsc(line)}</p>`).join('')}<p>Los pagos antiguos dados por saldados se conservan en el histórico y no se vuelven a reclamar.</p>${originals.length?'<h3>Pagos del saldo de partida</h3>'+originals.map(row=>`<button class="balance-record" data-record="${moneyEsc(row.id)}" onclick="moneyReviewDetails(moneyRecord(this.dataset.record))"><span>${moneyEsc(row.data.title)}</span><b>${moneyEuro(row.data.payments.filter(p=>p.account==='agus').reduce((sum,p)=>sum+p.amount,0))}</b><i>↗</i></button>`).join(''):''}${changes.length?'<h3>Movimientos posteriores</h3>'+changes.map(item=>`<button class="balance-record" data-record="${moneyEsc(item.id)}" onclick="moneyReviewDetails(moneyRecord(this.dataset.record))"><span>${moneyEsc(item.title)}<small>${moneyBalanceDate(item.date)}</small></span><b>${item.delta>=0?'+':'−'} ${moneyEuro(Math.abs(item.delta))}</b><i>↗</i></button>`).join(''):'<p>Sin movimientos posteriores que cambien este saldo.</p>'}</div>`);
}
