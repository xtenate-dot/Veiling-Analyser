*{box-sizing:border-box;margin:0;padding:0}
:root{--brand:#c89b3c;--brand-light:#2a2f22;--accent:#d98c3a;--bg:#ebebeb;--surface:#f5f5f3;--border:#d4d4d0;--text:#2b2b28;--muted:#6b6b64;--voice:Georgia,'Times New Roman',serif}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
header{background:#242424;color:#e8e0d0;padding:14px 22px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100;border-bottom:1px solid #4d4d4a}
.logo{width:36px;height:36px;background:var(--brand);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;border:1px solid #4a3f22}
header h1{font-size:18px;font-weight:700;font-family:var(--voice)}
header p{font-size:11px;opacity:.65;margin-top:1px}
.hdr-r{margin-left:auto;display:flex;gap:8px}
.hbtn{padding:7px 13px;border-radius:7px;border:none;font-size:13px;font-weight:600;cursor:pointer}
.hbtn-ghost{background:rgba(255,255,255,.15);color:white}
.hbtn-ghost:hover{background:rgba(255,255,255,.25)}
.hbtn-accent{background:var(--accent);color:#1c1a17}
.apikey-bar{background:#2a2415;border-bottom:1px solid #4a3f22;padding:10px 22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
.apikey-bar input{flex:1;min-width:200px;padding:7px 10px;border:1px solid #4a3f22;border-radius:7px;font-size:13px;font-family:monospace;outline:none}
.apikey-bar .save-btn{padding:7px 14px;background:var(--brand);color:#1c1a17;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.apikey-ok{background:#2a2f22;border-bottom:1px solid #332d1e;padding:8px 22px;font-size:13px;color:#6fae74;display:flex;align-items:center;gap:8px}
.tabs{display:flex;background:var(--surface);border-bottom:1px solid var(--border);padding:0 18px;gap:4px;overflow-x:auto}
.tab{padding:11px 15px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;color:var(--muted);white-space:nowrap;transition:all .15s}
.tab.active{color:var(--brand);border-bottom-color:var(--brand)}
.tab-badge{background:var(--accent);color:#1c1a17;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:4px}
.sel-balk{background:#2a2415;border-bottom:1px solid #4a3f22;padding:9px 18px;display:none;align-items:center;gap:10px;flex-wrap:wrap}
.sel-balk span{font-size:13px;font-weight:600;color:#d9b46a}
.sel-del-btn{padding:7px 13px;background:#c0433d;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer}
.sel-action{padding:6px 12px;background:transparent;color:#d9b46a;border:1px solid #4a3f22;border-radius:7px;font-size:13px;cursor:pointer}
.main{max-width:960px;margin:0 auto;padding:20px 18px}
.panel{display:none}.panel.active{display:block}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px}
.card-title{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
input[type=text],input[type=number],textarea,select{width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);font-family:inherit;outline:none;transition:border-color .15s}
input:focus,textarea:focus,select:focus{border-color:var(--brand);background:#ffffff}
textarea{resize:vertical;min-height:75px}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;margin-top:12px}
label:first-child{margin-top:0}
.hint{font-size:12px;color:var(--muted);margin-bottom:6px}
.btn-primary{width:100%;padding:13px;background:var(--brand);color:#1c1a17;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;transition:background .15s}
.btn-primary:hover{background:#ad8534}
.btn-primary:disabled{background:#5c574a;cursor:not-allowed}
.btn-sm{background:var(--brand-light);color:var(--brand);border:none;border-radius:7px;font-size:12px;font-weight:600;padding:5px 10px;cursor:pointer}
.btn-sm:hover{background:#332d1e}
.btn-danger{background:#2e1c1a;color:#d1837a;border:none;border-radius:7px;font-size:12px;padding:5px 8px;cursor:pointer}
.bod-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.bod-btn{padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.bod-btn.active{background:var(--brand);color:#1c1a17;border-color:var(--brand)}
.spinner{width:17px;height:17px;border:2.5px solid rgba(28,26,23,.3);border-top-color:#1c1a17;border-radius:50%;animation:spin .65s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.steps{display:flex;flex-direction:column;gap:6px;margin-top:14px}
.step{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);padding:9px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)}
.step.active{color:var(--brand);background:var(--brand-light);border-color:#6b5a30;font-weight:600}
.step.done{color:#6fae74}
.step-spin{width:14px;height:14px;border:2px solid rgba(26,71,42,.2);border-top-color:var(--brand);border-radius:50%;animation:spin .65s linear infinite;flex-shrink:0}
.msg{padding:11px 14px;border-radius:8px;font-size:13px;margin-top:10px;display:none;line-height:1.5}
.msg.err{background:#2e1c1a;color:#d1837a}
.verdict{border-radius:12px;padding:16px 18px;margin-bottom:16px;border:1px solid}
.v-kopen{background:#1c2b1c;border-color:#3f5a43}
.v-twijfel{background:#2a2415;border-color:#4a3f22}
.v-skip{background:#2e1c1a;border-color:#5a3530}
.verdict h3{font-size:17px;font-weight:700;margin-bottom:5px;font-family:var(--voice)}
.v-kopen h3{color:#6fae74}.v-twijfel h3{color:#d9b46a}.v-skip h3{color:#d1837a}
.verdict p{font-size:14px;line-height:1.6}
.costs-box{background:#241f14;border:1px solid #4a3f22;border-radius:11px;padding:15px;margin-bottom:16px}
.costs-box h4{font-size:11px;font-weight:700;color:#d9b46a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.c-row{display:flex;justify-content:space-between;font-size:14px;padding:5px 0;border-bottom:1px solid #211e193c444}
.c-row:last-child{border:none;font-weight:700;font-size:15px}
.c-pos{color:#6fae74;font-weight:700}.c-neg{color:#c0605a;font-weight:700}
.price-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.p-card{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:15px}
.p-platform{font-size:14px;font-weight:700;margin-bottom:10px}
.mp{color:#e0954a}
.ebay{background:linear-gradient(90deg,#e53238,#0064d2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.p-main{font-size:24px;font-weight:800;font-family:var(--voice)}
.p-range{font-size:13px;color:var(--muted)}
.p-sub{font-size:12px;color:var(--muted);margin:3px 0 8px}
.p-tip{font-size:13px;background:var(--bg);border-radius:7px;padding:9px 11px;line-height:1.5}
.badge{font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px}
.b-high{background:#1c2b1c;color:#6fae74}.b-mid{background:#2b2311;color:#d9b46a}.b-low{background:#2e1c1a;color:#d1837a}
.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.tag{background:#262219;font-size:12px;padding:2px 8px;border-radius:20px}
.roi-wrap{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:15px;margin-bottom:16px}
.roi-bar{height:9px;background:var(--border);border-radius:99px;overflow:hidden;margin:7px 0 5px}
.roi-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#d98c3a,#5a8f5e)}
.roi-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.detail-card{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:15px}
.detail-card ul{list-style:none}
.detail-card ul li{font-size:13px;padding:5px 0;border-bottom:1px solid var(--bg);display:flex;gap:7px;line-height:1.4}
.detail-card ul li:last-child{border:none}
.detail-card ul li::before{content:'-->';color:var(--brand);font-weight:700;flex-shrink:0}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 16px;text-align:center}
.stat-num{font-size:22px;font-weight:800}
.stat-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.stats-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.filter-bar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px}
.filter-btn{padding:6px 13px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);font-size:13px;font-weight:600;cursor:pointer;color:var(--muted);transition:all .15s}
.filter-btn.active{background:var(--brand);color:#1c1a17;border-color:var(--brand)}
.kavel-list{display:flex;flex-direction:column;gap:10px}
.kavel-row{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:12px 14px;display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;transition:border-color .15s}
.kavel-row:hover{border-color:#6b5a30}
.selectie-col{display:none}
.selectie-modus .selectie-col{display:block}
.kavel-checkbox{width:18px;height:18px;accent-color:var(--brand);cursor:pointer}
.kavel-row.geselecteerd{background:#2a2f22;border-color:#4a7a52}
.kavel-num{font-size:11px;font-weight:700;color:var(--muted);width:20px}
.kavel-titel{font-size:15px;font-weight:700;margin-bottom:3px;line-height:1.3;font-family:var(--voice)}
.kavel-meta{font-size:12px;color:var(--muted);margin-bottom:6px}
.kavel-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
.pill{font-size:11px;padding:2px 7px;border-radius:20px;font-weight:600}
.pill-bod{background:#2a2f22;color:var(--brand)}
.pill-eigen-bod{background:#1a2530;color:#6ea8e0}
.pill-totaal{background:#241f14;color:#d9b46a;border:1px solid #4a3f22}
.pill-marge-pos{background:#1c2b1c;color:#6fae74}
.pill-marge-neg{background:#2e1c1a;color:#d1837a}
.pill-mp{background:#2b2311;color:#e0954a}
.pill-veiling{background:#241f30;color:#9d85d9}
.pill-status{color:white}
.s-klaar{background:#3f8f4c}.s-twijfel{background:#cc7a2c}.s-skip{background:#c0433d}.s-wacht{background:#7a7468}
.kavel-acties{display:flex;gap:5px;align-items:center}
.kavel-reden{font-size:11px;color:var(--muted);font-style:italic;margin-top:4px}
.back-btn{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--brand);cursor:pointer;margin-bottom:16px;padding:7px 11px;background:var(--brand-light);border-radius:8px;border:none}
.empty{text-align:center;padding:48px 20px;color:var(--muted)}
.empty-icon{font-size:48px;margin-bottom:14px}
.empty h3{font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;font-family:var(--voice)}
.empty p{font-size:14px;line-height:1.6;max-width:400px;margin:0 auto 18px}
.upload-zone{border:2px dashed var(--border);border-radius:10px;padding:18px;text-align:center;cursor:pointer;position:relative;transition:all .15s;background:var(--bg)}
.upload-zone:hover,.upload-zone.drag{border-color:var(--brand);background:var(--brand-light)}
.upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-zone p{font-size:13px;color:var(--muted)}
.previews{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.prev{position:relative;width:72px;height:72px}
.prev img{width:72px;height:72px;object-fit:cover;border-radius:7px;border:1px solid var(--border);display:block}
.prev-del{position:absolute;top:-6px;right:-6px;width:20px;height:20px;background:#c0605a;color:white;border:none;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:24px 14px;overflow-y:auto}
.modal-overlay.open{display:flex}
.modal-box{background:var(--surface);border-radius:14px;max-width:640px;width:100%;padding:20px;margin-top:16px}
.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.modal-head h2{font-size:17px;font-weight:700;font-family:var(--voice)}
.modal-close{background:var(--bg);border:none;border-radius:7px;width:30px;height:30px;font-size:16px;cursor:pointer;color:var(--muted)}
.vh-row{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px}
.vh-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.vh-name{font-weight:700;font-size:14px}
.vh-meta{font-size:12px;color:var(--muted);margin-top:2px}
.vh-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.small-note{font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px}
@media(max-width:600px){
  .price-grid,.detail-grid{grid-template-columns:1fr}
  .kavel-row{grid-template-columns:auto auto 1fr;gap:7px}
  .kavel-acties{grid-column:1/-1;flex-wrap:wrap}
  .vh-form-grid{grid-template-columns:1fr}
  header{padding:12px 16px}
}

.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#242424;color:#e8e0d0;padding:12px 18px;border-radius:9px;font-size:13px;max-width:90vw;box-shadow:0 4px 18px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:500;border:1px solid #4d4d4a}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast-error{border-color:#5a3530;background:#2e1c1a;color:#d1837a}
.toast-success{border-color:#3f5a43;background:#1c2b1c;color:#6fae74}
#sync-status{font-size:11px;opacity:.7;margin-top:1px}
.overzicht-tools{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.overzicht-tools input[type=text]{flex:1;min-width:160px}
.overzicht-tools select{width:auto;min-width:140px}
.export-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.import-label{background:var(--brand-light);color:var(--brand);border-radius:7px;font-size:12px;font-weight:600;padding:5px 10px;cursor:pointer;display:inline-block}
.import-label input{display:none}
