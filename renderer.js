"use strict";

const accountsElement = document.querySelector("#accounts");
const countElement = document.querySelector("#account-count");
const toast = document.querySelector("#toast");
let state = { accounts: [], browserPath: "", defaultChromePath: "" };

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[character]));
}

function render() {
  countElement.textContent = `${state.accounts.length} 件`;
  if (!state.accounts.length) {
    accountsElement.innerHTML = '<div class="empty">まだアカウントがありません。<br>追加後、起動したChromeで公式Robloxに手動ログインしてください。</div>';
    return;
  }
  accountsElement.innerHTML = state.accounts.map((account) => `
    <article class="account"><h3>${escapeHtml(account.name)}</h3>
      ${account.username ? `<p class="username">@${escapeHtml(account.username)}</p>` : ""}
      ${account.note ? `<p class="note">${escapeHtml(account.note)}</p>` : '<p class="note">メモなし</p>'}
      <div class="card-actions"><button class="primary launch" data-launch="${account.id}">Chromeで開く</button><button class="delete" data-remove="${account.id}">削除</button></div>
    </article>`).join("");
}

async function reload() { state = await window.launcher.load(); render(); }
document.querySelector("#open-add").addEventListener("click", () => document.querySelector("#account-dialog").showModal());
document.querySelector("#open-settings").addEventListener("click", () => { document.querySelector("#browser-path").value = state.browserPath || state.defaultChromePath || ""; document.querySelector("#settings-dialog").showModal(); });
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close()));
document.querySelector("#account-form").addEventListener("submit", async (event) => { event.preventDefault(); try { state.accounts = await window.launcher.addAccount({ name: document.querySelector("#name").value, username: document.querySelector("#username").value, note: document.querySelector("#note").value }); event.target.reset(); document.querySelector("#account-dialog").close(); render(); showToast("アカウントを追加しました。"); } catch (error) { showToast(error.message); } });
document.querySelector("#choose-browser").addEventListener("click", async () => { const file = await window.launcher.chooseBrowser(); if (file) document.querySelector("#browser-path").value = file; });
document.querySelector("#settings-form").addEventListener("submit", async (event) => { event.preventDefault(); try { state.browserPath = await window.launcher.setBrowser(document.querySelector("#browser-path").value); document.querySelector("#settings-dialog").close(); showToast("Chromeの場所を保存しました。"); } catch (error) { showToast(error.message); } });
accountsElement.addEventListener("click", async (event) => { const id = event.target.dataset.launch || event.target.dataset.remove; if (!id) return; try { if (event.target.dataset.launch) { await window.launcher.launch(id); showToast("専用Chromeプロファイルを開きました。"); } else if (confirm("この一覧から削除しますか？ Chromeプロファイルは削除しません。")) { state.accounts = await window.launcher.removeAccount(id); render(); showToast("一覧から削除しました。"); } } catch (error) { showToast(error.message); } });
reload();
