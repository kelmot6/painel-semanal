/* Supabase Auth + sync for the existing single-file panel.
   Client-side publishable key only. Never use a service_role/secret key here. */
(() => {
  const cfg = window.SUPABASE_CONFIG || {};
  const configReady = cfg.url && cfg.publishableKey &&
    /^https:\/\//.test(cfg.url) &&
    !cfg.url.includes("COLE_AQUI") && !cfg.publishableKey.includes("COLE_AQUI");
  const style = document.createElement("style");
  style.textContent = `
    body.auth-locked .wrap { display:none !important; }
    #authGate { min-height:100vh; display:grid; place-items:center; padding:22px; color:#edf4ef; }
    #authGate .auth-card { width:min(100%,440px); padding:24px; border:1px solid #29362f; border-radius:18px; background:#121a17; }
    #authGate h1 { margin:0 0 8px; font-size:25px; } #authGate p { color:#9eafa5; font-size:13px; }
    #authGate label { display:block; font-size:12px; color:#9eafa5; margin:12px 0 5px; }
    #authGate input { width:100%; padding:12px; border-radius:10px; background:#0e1512; color:#edf4ef; border:1px solid #29362f; }
    #authGate button { margin:8px 6px 0 0; padding:10px 12px; border-radius:10px; border:1px solid #29362f; background:#19231f; color:#edf4ef; cursor:pointer; }
    #authGate button.primary { background:#b8f36b; color:#15200f; border-color:#b8f36b; }
    #authGate .status { white-space:pre-wrap; margin-top:14px; color:#b8f36b; }
    #authGate .choices { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  `;
  document.head.appendChild(style);
  document.body.classList.add("auth-locked");
  const gate = document.createElement("section");
  gate.id = "authGate";
  gate.innerHTML = `<div class="auth-card">
    <div style="color:#b8f36b;font-size:11px;font-weight:800;letter-spacing:1.5px">PAINEL HÍBRIDO</div>
    <h1>Entre na sua conta</h1>
    <p>Seus registros locais serão preservados. A sincronização só começa depois da autenticação e da confirmação de como tratar os dados.</p>
    <div id="authConfigWarning" hidden style="border:1px solid #6b572b;padding:12px;border-radius:10px;color:#e8d8a8">Falta configurar <code>supabase-config.js</code> com a API URL e a Publishable key do projeto. Nunca use a Secret key.<br><button id="continueLocal" class="primary">Continuar no modo local por enquanto</button></div>
    <div id="authFields">
      <label for="authEmail">E-mail</label><input id="authEmail" type="email" autocomplete="email" required>
      <label for="authPassword">Senha (mínimo 8 caracteres)</label><input id="authPassword" type="password" autocomplete="current-password" minlength="8" required>
      <div><button class="primary" id="authLogin">Entrar</button><button id="authSignup">Criar conta</button></div>
      <button id="authReset">Esqueci a senha</button>
    </div>
    <div id="syncChoices" hidden>
      <p id="syncPrompt"></p><div class="choices">
        <button class="primary" id="keepLocal">Manter este dispositivo e enviar para nuvem</button>
        <button id="useCloud">Usar os dados da nuvem neste dispositivo</button>
      </div>
      <p>Se escolher dados da nuvem, primeiro baixe um backup dos dados locais se ainda não o fez. Essa escolha substitui somente as chaves do painel neste navegador.</p>
    </div>
    <div class="status" id="authStatus" role="status" aria-live="polite"></div>
  </div>`;
  document.body.insertBefore(gate, document.body.firstChild);
  const $ = id => document.getElementById(id);
  const status = msg => $("authStatus").textContent = msg;
  if (!configReady || !window.supabase) {
    $("authConfigWarning").hidden = false;
    $("authFields").hidden = true;
    status("Configuração pendente. Preencha supabase-config.js para ativar login e nuvem, ou continue usando o armazenamento local.");
    const localButton = $("continueLocal");
    if (localButton) localButton.onclick = () => { document.body.classList.remove("auth-locked"); gate.style.display = "none"; };
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const DATA_KEYS = ["hibrido_dashboard_v1", "hibrido_routine_study_v1"];
  let activeUser = null, syncing = false, pendingTimer = null;

  function readLocal() {
    const out = {};
    for (const k of DATA_KEYS) {
      const raw = localStorage.getItem(k);
      if (raw !== null) { try { out[k] = JSON.parse(raw); } catch { out[k] = raw; } }
    }
    return out;
  }
  function hasData(obj) { return obj && Object.keys(obj).length > 0; }
  function writeLocal(obj) {
    syncing = true;
    try {
      for (const k of DATA_KEYS) {
        if (Object.prototype.hasOwnProperty.call(obj || {}, k)) {
          localStorage.setItem(k, typeof obj[k] === "string" ? obj[k] : JSON.stringify(obj[k]));
        }
      }
    } finally { syncing = false; }
    window.dispatchEvent(new Event("routine-data-imported"));
  }
  async function getCloud() {
    const { data, error } = await client.from("user_app_data").select("data,updated_at").eq("user_id", activeUser.id).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function putCloud(payload) {
    const { error } = await client.from("user_app_data").upsert({
      user_id: activeUser.id, data: payload, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
  }
  async function chooseData() {
    status("Conferindo os dados da conta…");
    const local = readLocal();
    const cloudRow = await getCloud();
    const cloud = cloudRow && cloudRow.data ? cloudRow.data : {};
    const localHas = hasData(local), cloudHas = hasData(cloud);
    if (!cloudHas && localHas) {
      await putCloud(local);
      status("Dados locais enviados para a nuvem. Sincronização ativada.");
      return true;
    }
    if (cloudHas && !localHas) {
      writeLocal(cloud);
      status("Dados da nuvem carregados neste dispositivo.");
      return true;
    }
    if (!cloudHas && !localHas) {
      await putCloud({});
      status("Conta pronta. Ainda não há registros para sincronizar.");
      return true;
    }
    // Never silently overwrite either side if both have content.
    $("syncPrompt").textContent = "Encontramos dados neste dispositivo e na nuvem. Escolha qual versão manter para esta conta. Para mesclar os dois históricos, cancele por enquanto e guarde os backups; a mesclagem segura será adicionada em etapa posterior.";
    $("authFields").hidden = true;
    $("syncChoices").hidden = false;
    return false;
  }
  async function startSync() {
    if (!activeUser || syncing) return;
    try {
      await putCloud(readLocal());
      status("Sincronizado com a nuvem.");
    } catch (e) { status("Não foi possível sincronizar. Seus dados locais continuam salvos. " + (e.message || "")); }
  }
  function scheduleSync() {
    if (!activeUser || syncing || !navigator.onLine) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(startSync, 1200);
  }
  // Listen to local writes made by the existing panel scripts.
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    if (DATA_KEYS.includes(key)) scheduleSync();
  };
  window.addEventListener("online", scheduleSync);

  async function finishLogin(user) {
    activeUser = user;
    status("Conta autenticada. Preparando seus dados…");
    $("authFields").hidden = true;
    try {
      const ready = await chooseData();
      if (ready) {
        document.body.classList.remove("auth-locked");
        gate.style.display = "none";
      }
    } catch (e) {
      status("Não foi possível carregar a conta. Seus dados locais não foram apagados. Verifique a tabela, as políticas RLS e a conexão. " + (e.message || ""));
      $("authFields").hidden = false;
    }
  }
  $("authLogin").onclick = async () => {
    const email = $("authEmail").value.trim(), password = $("authPassword").value;
    if (!email || !password) return status("Informe e-mail e senha.");
    status("Entrando…");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return status(error.message);
    await finishLogin(data.user);
  };
  $("authSignup").onclick = async () => {
    const email = $("authEmail").value.trim(), password = $("authPassword").value;
    if (!email || password.length < 8) return status("Informe um e-mail válido e uma senha com pelo menos 8 caracteres.");
    status("Criando conta…");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return status(error.message);
    if (data.session && data.user) await finishLogin(data.user);
    else status("Cadastro iniciado. Confira seu e-mail para confirmar a conta e depois entre.");
  };
  $("authReset").onclick = async () => {
    const email = $("authEmail").value.trim();
    if (!email) return status("Digite seu e-mail para receber o link de redefinição.");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    status(error ? error.message : "Se a conta existir, você receberá um e-mail para redefinir a senha.");
  };
  $("keepLocal").onclick = async () => {
    try {
      await putCloud(readLocal());
      document.body.classList.remove("auth-locked"); gate.style.display = "none";
      $("authFields").hidden = false; $("syncChoices").hidden = true;
      status("Dados locais enviados para a nuvem.");
    } catch (e) { status("Falha ao enviar dados. Os dados locais continuam preservados. " + (e.message || "")); }
  };
  $("useCloud").onclick = async () => {
    try {
      const row = await getCloud();
      if (!row || !row.data) return status("Não encontramos dados na nuvem.");
      writeLocal(row.data);
      document.body.classList.remove("auth-locked"); gate.style.display = "none";
      $("authFields").hidden = false; $("syncChoices").hidden = true;
      status("Dados da nuvem carregados neste dispositivo.");
    } catch (e) { status("Falha ao carregar dados da nuvem. " + (e.message || "")); }
  };
  client.auth.getSession().then(({ data, error }) => {
    if (error) return status(error.message);
    if (data.session) finishLogin(data.session.user);
    else status("Entre ou crie uma conta para continuar.");
  });
})();
