const CHAVE_ENTREGADORES = "portal_bigmais_entregadores_v1";
const CHAVE_LANCAMENTOS_ENTREGAS = "portal_bigmais_lancamentos_entregas_v1";
const ITENS_POR_PAGINA = 10;

let entregadores = [];
let lancamentosEntregas = [];
let paginaEntregadores = 1;
let paginaHistorico = 1;
let filtroFuncaoLancamento = "TODOS";

function normalizarStatusEntregador(valor) {
  const texto = String(valor || "").trim().toLowerCase();
  return texto === "inativo" ? "Inativo" : "Ativo";
}

function normalizarTextoBusca(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseNumeroSeguro(valor) {
  if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
  const limpo = String(valor || "")
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(?:,|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function carregarDadosLocais() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_ENTREGADORES) || "[]");
    entregadores = Array.isArray(lista)
      ? lista.map((e) => ({
          ...e,
          tarifa: parseNumeroSeguro(e.tarifa),
          status: normalizarStatusEntregador(e.status),
        }))
      : [];
  } catch (e) {
    entregadores = [];
  }

  try {
    const listaLanc = JSON.parse(
      localStorage.getItem(CHAVE_LANCAMENTOS_ENTREGAS) || "[]"
    );
    lancamentosEntregas = Array.isArray(listaLanc)
      ? listaLanc.map((l) => {
          const tarifa = parseNumeroSeguro(l.tarifaUnitaria);
          const qtd = parseNumeroSeguro(l.quantidade);
          const com = parseNumeroSeguro(l.valorComissao);
          return {
            ...l,
            data: normalizarDataISO(l.data),
            tarifaUnitaria: tarifa,
            quantidade: qtd,
            valorComissao:
              com > 0 ? com : Number((tarifa * qtd).toFixed(2)),
          };
        })
      : [];
  } catch (e) {
    lancamentosEntregas = [];
  }
}

function salvarDadosLocais() {
  localStorage.setItem(CHAVE_ENTREGADORES, JSON.stringify(entregadores));
  localStorage.setItem(
    CHAVE_LANCAMENTOS_ENTREGAS,
    JSON.stringify(lancamentosEntregas)
  );
}

function atualizarStatusBanco(estado, texto) {
  const el = document.getElementById("status-banco-entregas");
  if (!el) return;
  el.className = "status-sincronizacao";
  if (estado) el.classList.add(estado);
  el.textContent = texto;
}

function copiarLinkMotorista() {
  const urlBase = window.location.href.replace(/[^/]*$/, "");
  const linkCompleto = `${urlBase}motorista.html`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(linkCompleto).then(() => {
      alert(`Link mobile copiado para enviar aos motoristas:\n\n${linkCompleto}`);
    });
  } else {
    prompt("Copie o link abaixo para enviar aos motoristas:", linkCompleto);
  }
}

async function enviarRequisicaoBanco(payload) {
  if (typeof URL_API_PLANILHA === "undefined" || !URL_API_PLANILHA) {
    return null;
  }

  const resp = await fetch(URL_API_PLANILHA, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  return await resp.json();
}

async function sincronizarComBanco(exibirAlerta = false) {
  if (typeof URL_API_PLANILHA === "undefined" || !URL_API_PLANILHA) {
    atualizarStatusBanco("erro", "Banco: URL não configurada (modo local)");
    return;
  }

  atualizarStatusBanco("carregando", "Banco: sincronizando...");

  try {
    const separador = URL_API_PLANILHA.includes("?") ? "&" : "?";
    const url = `${URL_API_PLANILHA}${separador}acao=listarDadosEntregas&t=${Date.now()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const dados = await resp.json();
    if (!dados || dados.sucesso === false) {
      throw new Error((dados && dados.erro) || "Falha ao carregar dados.");
    }

    if (Array.isArray(dados.entregadores)) {
      entregadores = dados.entregadores.map((e) => ({
        id: String(e.id || "").trim(),
        nome: String(e.nome || "").trim(),
        chapa: String(e.chapa || "").trim(),
        funcao: String(e.funcao || "Motorista").trim(),
        tarifa: parseNumeroSeguro(e.tarifa),
        cpf: String(e.cpf || "").trim(),
        telefone: String(e.telefone || "").trim(),
        status: normalizarStatusEntregador(e.status),
      }));
    }

    if (Array.isArray(dados.lancamentos)) {
      lancamentosEntregas = dados.lancamentos.map((l) => {
        const tarifa = parseNumeroSeguro(l.tarifaUnitaria);
        const qtd = parseNumeroSeguro(l.quantidade);
        const com = parseNumeroSeguro(l.valorComissao);
        return {
          id: String(l.id || "").trim(),
          data: normalizarDataISO(l.data),
          loja: String(l.loja || "").trim(),
          entregadorId: String(l.entregadorId || "").trim(),
          entregadorNome: String(l.entregadorNome || "").trim(),
          entregadorChapa: String(l.entregadorChapa || "").trim(),
          funcao: String(l.funcao || "").trim(),
          tarifaUnitaria: tarifa,
          quantidade: qtd,
          valorComissao:
            com > 0 ? com : Number((tarifa * qtd).toFixed(2)),
          observacao: String(l.observacao || "").trim(),
          lancadoPor: String(l.lancadoPor || "Não identificado").trim(),
        };
      });
    }

    salvarDadosLocais();
    renderizarTudo();
    atualizarStatusBanco("ok", "Banco: sincronizado");
  } catch (erro) {
    console.warn("Aviso ao sincronizar entregas com o banco:", erro);
    atualizarStatusBanco("erro", "Banco: offline (usando cache local)");
    if (exibirAlerta) {
      alert(
        "Não foi possível conectar ao banco de dados agora. Verifique se o Apps Script está atualizado."
      );
    }
  }
}

function normalizarDataISO(valor) {
  if (!valor) return "";
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const p = texto.split("/");
    return `${p[2]}-${p[1]}-${p[0]}`;
  }
  return texto;
}

function formatarMoedaBR(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function moedaParaNumero(texto) {
  return parseNumeroSeguro(texto);
}

function mascaraMoedaEntrega(input) {
  const digitos = input.value.replace(/\D/g, "");
  if (!digitos) {
    input.value = "";
    return;
  }
  input.value = formatarMoedaBR(parseInt(digitos, 10) / 100);
}

function mascaraCPFEntrega(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  input.value = v;
  input.setCustomValidity("");
}

function validarCPFEntrega(cpf) {
  const numeros = String(cpf || "").replace(/\D/g, "");
  if (numeros.length !== 11 || /^(\d)\1{10}$/.test(numeros)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(numeros.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(numeros.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(numeros.charAt(10), 10);
}

function verificarCPFEntrega(input) {
  if (!input || input.value.trim() === "") return;
  if (!validarCPFEntrega(input.value)) {
    input.setCustomValidity("CPF inválido. Verifique os números digitados.");
    input.reportValidity();
  } else {
    input.setCustomValidity("");
  }
}

function mascaraTelefoneEntrega(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  } else if (v.length > 6) {
    v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  }
  input.value = v;
}

function obterDataHojeISO() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function obterPrimeiroDiaMesISO(dataISO) {
  const base = dataISO || obterDataHojeISO();
  return `${base.slice(0, 7)}-01`;
}

function formatarDataISOparaBR(dataISO) {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return dataISO || "-";
  const partes = dataISO.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escaparHTML(texto) {
  const valor = texto === null || texto === undefined ? "" : String(texto);
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugTextoArquivo(texto) {
  return String(texto || "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function preencherOperadorLogado() {
  if (typeof preencherDadosUsuarioLogado === "function") {
    preencherDadosUsuarioLogado({
      seletoresSolicitante: ["#entrega-lancado-por"],
      seletoresLoja: ["#entrega-loja"],
      somenteSeVazio: false,
    });
  }

  const campoOperador = document.getElementById("entrega-lancado-por");
  if (campoOperador && !campoOperador.value && typeof obterSessaoAtual === "function") {
    const sessao = obterSessaoAtual();
    if (sessao && sessao.nome) {
      campoOperador.value = sessao.nome;
    }
  }
}

function renderizarControlesPaginacao(
  containerId,
  totalItens,
  paginaAtual,
  fnMudarPagina
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalItens === 0) {
    container.innerHTML = "";
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(totalItens / ITENS_POR_PAGINA));
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, totalItens);

  container.innerHTML = `
    <span>Mostrando <strong>${inicio}–${fim}</strong> de <strong>${totalItens}</strong> registros (10 por página)</span>
    <div class="controles-paginacao">
      <button
        type="button"
        class="btn-paginacao"
        ${paginaAtual <= 1 ? "disabled" : ""}
        onclick="${fnMudarPagina}(${paginaAtual - 1})"
      >
        ← Anterior
      </button>
      <span>Página <strong>${paginaAtual}</strong> de <strong>${totalPaginas}</strong></span>
      <button
        type="button"
        class="btn-paginacao"
        ${paginaAtual >= totalPaginas ? "disabled" : ""}
        onclick="${fnMudarPagina}(${paginaAtual + 1})"
      >
        Próxima →
      </button>
    </div>
  `;
}

function mudarPaginaEntregadores(novaPagina) {
  paginaEntregadores = Math.max(1, novaPagina);
  renderizarTabelaEntregadores();
}

function mudarPaginaHistorico(novaPagina) {
  paginaHistorico = Math.max(1, novaPagina);
  renderizarHistorico();
}

function definirFiltroFuncaoLancamento(funcao) {
  filtroFuncaoLancamento = funcao || "TODOS";

  document
    .querySelectorAll("#box-seletor-lancamento .pill-funcao")
    .forEach((btn) => {
      btn.classList.toggle(
        "ativo",
        btn.getAttribute("data-funcao") === filtroFuncaoLancamento
      );
    });

  abrirListaLancamento();
}

function renderizarOpcoesListaLancamento(termoBusca = "") {
  const listaEl = document.getElementById("lista-sugestoes-lancamento");
  const hiddenId = document.getElementById("entrega-entregador");
  if (!listaEl) return;

  const selecionadoId = hiddenId ? hiddenId.value : "";
  const termo = normalizarTextoBusca(termoBusca);

  const candidatos = entregadores
    .filter((e) => normalizarStatusEntregador(e.status) === "Ativo")
    .filter((e) => {
      if (
        filtroFuncaoLancamento !== "TODOS" &&
        e.funcao !== filtroFuncaoLancamento
      ) {
        return false;
      }
      if (!termo) return true;
      const nomeNorm = normalizarTextoBusca(e.nome);
      const chapaNorm = normalizarTextoBusca(e.chapa);
      const funcaoNorm = normalizarTextoBusca(e.funcao);
      return (
        nomeNorm.includes(termo) ||
        chapaNorm.includes(termo) ||
        funcaoNorm.includes(termo)
      );
    })
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  if (candidatos.length === 0) {
    listaEl.innerHTML = `
      <div class="item-sugestao-entregador" style="cursor: default; color: #64748b;">
        <span>Nenhum entregador ativo encontrado.</span>
      </div>
    `;
    return;
  }

  listaEl.innerHTML = candidatos
    .map((e) => {
      const classeSel = e.id === selecionadoId ? "selecionado" : "";
      return `
        <div
          class="item-sugestao-entregador ${classeSel}"
          onmousedown="event.preventDefault(); selecionarEntregadorLancamento('${e.id}')"
        >
          <div class="item-sugestao-principal">
            <strong>${escaparHTML(e.nome)}</strong>
            <small>${escaparHTML(e.funcao)} • CHAPA ${escaparHTML(e.chapa || "-")}</small>
          </div>
          <div class="item-sugestao-direita">
            ${formatarMoedaBR(e.tarifa)}/ent.
          </div>
        </div>
      `;
    })
    .join("");
}

function abrirListaLancamento() {
  const listaEl = document.getElementById("lista-sugestoes-lancamento");
  const inputBusca = document.getElementById("busca-entregador-lancamento");
  const hiddenId = document.getElementById("entrega-entregador");
  if (!listaEl || !inputBusca) return;

  const entAtual = entregadores.find((e) => e.id === (hiddenId && hiddenId.value));
  const termo =
    entAtual && inputBusca.value.trim() === entAtual.nome ? "" : inputBusca.value;

  renderizarOpcoesListaLancamento(termo);
  listaEl.classList.add("aberto");
}

function fecharListaLancamento() {
  const listaEl = document.getElementById("lista-sugestoes-lancamento");
  if (listaEl) listaEl.classList.remove("aberto");
}

function alternarListaLancamento() {
  const listaEl = document.getElementById("lista-sugestoes-lancamento");
  if (!listaEl) return;
  if (listaEl.classList.contains("aberto")) {
    fecharListaLancamento();
  } else {
    const inputBusca = document.getElementById("busca-entregador-lancamento");
    if (inputBusca) inputBusca.focus();
    abrirListaLancamento();
  }
}

function filtrarListaLancamento() {
  const listaEl = document.getElementById("lista-sugestoes-lancamento");
  const inputBusca = document.getElementById("busca-entregador-lancamento");
  const hiddenId = document.getElementById("entrega-entregador");
  if (!listaEl || !inputBusca) return;

  if (hiddenId) hiddenId.value = "";
  atualizarResumoEntregadorLancamento(null);
  atualizarPreviaComissao();

  renderizarOpcoesListaLancamento(inputBusca.value);
  listaEl.classList.add("aberto");
}

function selecionarEntregadorLancamento(idEntregador) {
  const hiddenId = document.getElementById("entrega-entregador");
  const inputBusca = document.getElementById("busca-entregador-lancamento");
  const ent = entregadores.find((e) => e.id === idEntregador);

  if (!ent) return;

  if (hiddenId) hiddenId.value = ent.id;
  if (inputBusca) inputBusca.value = ent.nome;

  atualizarResumoEntregadorLancamento(ent);
  atualizarPreviaComissao();
  fecharListaLancamento();

  const qtdInput = document.getElementById("entrega-quantidade");
  if (qtdInput) qtdInput.focus();
}

function limparSelecaoLancamento() {
  const hiddenId = document.getElementById("entrega-entregador");
  const inputBusca = document.getElementById("busca-entregador-lancamento");
  if (hiddenId) hiddenId.value = "";
  if (inputBusca) {
    inputBusca.value = "";
    inputBusca.focus();
  }
  atualizarResumoEntregadorLancamento(null);
  atualizarPreviaComissao();
  abrirListaLancamento();
}

function atualizarResumoEntregadorLancamento(ent) {
  const box = document.getElementById("resumo-entregador-lancamento");
  if (!box) return;

  if (!ent) {
    box.className = "cartao-entregador-escolhido vazio";
    box.innerHTML = `<span>Nenhum entregador selecionado.</span>`;
    return;
  }

  box.className = "cartao-entregador-escolhido";
  box.innerHTML = `
    <span><strong>${escaparHTML(ent.nome)}</strong> • ${escaparHTML(ent.funcao)} • CHAPA ${escaparHTML(ent.chapa || "-")}</span>
    <strong>${formatarMoedaBR(ent.tarifa)}/entrega</strong>
  `;
}

function renderizarOpcoesListaPDF(termoBusca = "") {
  const listaEl = document.getElementById("lista-sugestoes-pdf");
  const hiddenId = document.getElementById("pdf-entregador");
  if (!listaEl) return;

  const selecionadoId = (hiddenId && hiddenId.value) || "TODOS";
  const termo = normalizarTextoBusca(termoBusca);

  const todosOrdenados = entregadores
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .filter((e) => {
      if (!termo) return true;
      const nomeNorm = normalizarTextoBusca(e.nome);
      const chapaNorm = normalizarTextoBusca(e.chapa);
      const funcaoNorm = normalizarTextoBusca(e.funcao);
      return (
        nomeNorm.includes(termo) ||
        chapaNorm.includes(termo) ||
        funcaoNorm.includes(termo)
      );
    });

  let html = "";

  if (!termo || "todos os entregadores relatorio geral".includes(termo)) {
    const selTodos = selecionadoId === "TODOS" ? "selecionado" : "";
    html += `
      <div
        class="item-sugestao-entregador ${selTodos}"
        onmousedown="event.preventDefault(); selecionarEntregadorPDF('TODOS')"
      >
        <div class="item-sugestao-principal">
          <strong>Todos os Entregadores (Relatório Geral)</strong>
          <small>Consolidado completo de motoristas e ajudantes no período</small>
        </div>
        <div class="item-sugestao-direita" style="color: #0284c7;">
          Geral
        </div>
      </div>
    `;
  }

  if (todosOrdenados.length === 0 && !html) {
    html = `
      <div class="item-sugestao-entregador" style="cursor: default; color: #64748b;">
        <span>Nenhum entregador encontrado para "${escaparHTML(termoBusca)}".</span>
      </div>
    `;
  } else {
    html += todosOrdenados
      .map((e) => {
        const st = normalizarStatusEntregador(e.status);
        const tagInativo = st === "Inativo" ? " • [Inativo]" : "";
        const sel = e.id === selecionadoId ? "selecionado" : "";
        return `
          <div
            class="item-sugestao-entregador ${sel}"
            onmousedown="event.preventDefault(); selecionarEntregadorPDF('${e.id}')"
          >
            <div class="item-sugestao-principal">
              <strong>${escaparHTML(e.nome)}</strong>
              <small>${escaparHTML(e.funcao)} • CHAPA ${escaparHTML(e.chapa || "-")}${tagInativo}</small>
            </div>
            <div class="item-sugestao-direita">
              ${formatarMoedaBR(e.tarifa)}/ent.
            </div>
          </div>
        `;
      })
      .join("");
  }

  listaEl.innerHTML = html;
}

function abrirListaPDF(selecionarTexto = false) {
  const listaEl = document.getElementById("lista-sugestoes-pdf");
  const inputBusca = document.getElementById("busca-entregador-pdf");
  if (!listaEl || !inputBusca) return;

  renderizarOpcoesListaPDF("");
  listaEl.classList.add("aberto");

  if (selecionarTexto) {
    inputBusca.select();
  }
}

function fecharListaPDF() {
  const listaEl = document.getElementById("lista-sugestoes-pdf");
  const hiddenId = document.getElementById("pdf-entregador");
  const inputBusca = document.getElementById("busca-entregador-pdf");
  if (listaEl) listaEl.classList.remove("aberto");

  if (hiddenId && inputBusca) {
    const val = hiddenId.value || "TODOS";
    if (val === "TODOS") {
      inputBusca.value = "Todos os Entregadores (Relatório Geral)";
    } else {
      const ent = entregadores.find((e) => e.id === val);
      if (ent) {
        inputBusca.value = `${ent.nome} (${ent.funcao} • CHAPA ${ent.chapa || "-"})`;
      }
    }
  }
}

function alternarListaPDF() {
  const listaEl = document.getElementById("lista-sugestoes-pdf");
  if (!listaEl) return;
  if (listaEl.classList.contains("aberto")) {
    fecharListaPDF();
  } else {
    const inputBusca = document.getElementById("busca-entregador-pdf");
    if (inputBusca) inputBusca.focus();
    abrirListaPDF(true);
  }
}

function filtrarListaPDF() {
  const listaEl = document.getElementById("lista-sugestoes-pdf");
  const inputBusca = document.getElementById("busca-entregador-pdf");
  if (!listaEl || !inputBusca) return;

  renderizarOpcoesListaPDF(inputBusca.value);
  listaEl.classList.add("aberto");
}

function selecionarEntregadorPDF(idEntregador) {
  const hiddenId = document.getElementById("pdf-entregador");
  const inputBusca = document.getElementById("busca-entregador-pdf");
  if (!hiddenId || !inputBusca) return;

  if (!idEntregador || idEntregador === "TODOS") {
    hiddenId.value = "TODOS";
    inputBusca.value = "Todos os Entregadores (Relatório Geral)";
  } else {
    const ent = entregadores.find((e) => e.id === idEntregador);
    if (ent) {
      hiddenId.value = ent.id;
      inputBusca.value = `${ent.nome} (${ent.funcao} • CHAPA ${ent.chapa || "-"})`;
    }
  }

  const listaEl = document.getElementById("lista-sugestoes-pdf");
  if (listaEl) listaEl.classList.remove("aberto");
}

function sincronizarSeletoresEntregadores() {
  const hiddenLanc = document.getElementById("entrega-entregador");
  const inputLanc = document.getElementById("busca-entregador-lancamento");
  if (hiddenLanc && hiddenLanc.value) {
    const ent = entregadores.find(
      (e) =>
        e.id === hiddenLanc.value &&
        normalizarStatusEntregador(e.status) === "Ativo"
    );
    if (ent) {
      if (inputLanc && document.activeElement !== inputLanc) {
        inputLanc.value = ent.nome;
      }
      atualizarResumoEntregadorLancamento(ent);
    } else {
      hiddenLanc.value = "";
      if (inputLanc) inputLanc.value = "";
      atualizarResumoEntregadorLancamento(null);
    }
  } else {
    atualizarResumoEntregadorLancamento(null);
  }

  const listaLanc = document.getElementById("lista-sugestoes-lancamento");
  if (listaLanc && listaLanc.classList.contains("aberto")) {
    renderizarOpcoesListaLancamento(inputLanc ? inputLanc.value : "");
  }

  const hiddenPdf = document.getElementById("pdf-entregador");
  const inputPdf = document.getElementById("busca-entregador-pdf");
  if (hiddenPdf && inputPdf && document.activeElement !== inputPdf) {
    const valPdf = hiddenPdf.value || "TODOS";
    if (valPdf === "TODOS") {
      inputPdf.value = "Todos os Entregadores (Relatório Geral)";
    } else {
      const entPdf = entregadores.find((e) => e.id === valPdf);
      if (entPdf) {
        inputPdf.value = `${entPdf.nome} (${entPdf.funcao} • CHAPA ${entPdf.chapa || "-"})`;
      } else {
        hiddenPdf.value = "TODOS";
        inputPdf.value = "Todos os Entregadores (Relatório Geral)";
      }
    }
  }

  const listaPdf = document.getElementById("lista-sugestoes-pdf");
  if (listaPdf && listaPdf.classList.contains("aberto")) {
    renderizarOpcoesListaPDF(inputPdf ? inputPdf.value : "");
  }
}

function renderizarOpcoesListaEdicaoLanc(termoBusca = "") {
  const listaEl = document.getElementById("lista-sugestoes-edicao-lanc");
  const hiddenId = document.getElementById("edit-lanc-entregador-id");
  if (!listaEl) return;

  const selecionadoId = (hiddenId && hiddenId.value) || "";
  const termo = normalizarTextoBusca(termoBusca);

  const candidatos = entregadores
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .filter((e) => {
      if (!termo) return true;
      return (
        normalizarTextoBusca(e.nome).includes(termo) ||
        normalizarTextoBusca(e.chapa).includes(termo) ||
        normalizarTextoBusca(e.funcao).includes(termo)
      );
    });

  if (candidatos.length === 0) {
    listaEl.innerHTML = `
      <div class="item-sugestao-entregador" style="cursor: default; color: #64748b;">
        <span>Nenhum entregador cadastrado encontrado.</span>
      </div>
    `;
    return;
  }

  listaEl.innerHTML = candidatos
    .map((e) => {
      const st = normalizarStatusEntregador(e.status);
      const tagInativo = st === "Inativo" ? " • [Inativo]" : "";
      const sel = e.id === selecionadoId ? "selecionado" : "";
      return `
        <div
          class="item-sugestao-entregador ${sel}"
          onmousedown="event.preventDefault(); selecionarEntregadorEdicaoLanc('${e.id}')"
        >
          <div class="item-sugestao-principal">
            <strong>${escaparHTML(e.nome)}</strong>
            <small>${escaparHTML(e.funcao)} • CHAPA ${escaparHTML(e.chapa || "-")}${tagInativo}</small>
          </div>
          <div class="item-sugestao-direita">
            ${formatarMoedaBR(e.tarifa)}/ent.
          </div>
        </div>
      `;
    })
    .join("");
}

function abrirListaEdicaoLanc(selecionarTexto = false) {
  const listaEl = document.getElementById("lista-sugestoes-edicao-lanc");
  const inputBusca = document.getElementById("busca-entregador-edicao");
  if (!listaEl || !inputBusca) return;

  renderizarOpcoesListaEdicaoLanc("");
  listaEl.classList.add("aberto");
  if (selecionarTexto) inputBusca.select();
}

function fecharListaEdicaoLanc() {
  const listaEl = document.getElementById("lista-sugestoes-edicao-lanc");
  if (listaEl) listaEl.classList.remove("aberto");
}

function alternarListaEdicaoLanc() {
  const listaEl = document.getElementById("lista-sugestoes-edicao-lanc");
  if (!listaEl) return;
  if (listaEl.classList.contains("aberto")) {
    fecharListaEdicaoLanc();
  } else {
    const inputBusca = document.getElementById("busca-entregador-edicao");
    if (inputBusca) inputBusca.focus();
    abrirListaEdicaoLanc(true);
  }
}

function filtrarListaEdicaoLanc() {
  const listaEl = document.getElementById("lista-sugestoes-edicao-lanc");
  const inputBusca = document.getElementById("busca-entregador-edicao");
  if (!listaEl || !inputBusca) return;

  renderizarOpcoesListaEdicaoLanc(inputBusca.value);
  listaEl.classList.add("aberto");
}

function atualizarResumoEdicaoLanc(ent, lancamentoFallback = null) {
  const box = document.getElementById("resumo-entregador-edicao-lanc");
  if (!box) return;

  if (ent) {
    box.className = "cartao-entregador-escolhido";
    box.innerHTML = `
      <span><strong>Vinculado:</strong> ${escaparHTML(ent.nome)} • ${escaparHTML(ent.funcao)} • CHAPA ${escaparHTML(ent.chapa || "-")}</span>
      <strong>${formatarMoedaBR(ent.tarifa)}/ent.</strong>
    `;
    return;
  }

  box.className = "cartao-entregador-escolhido vazio";
  const nomeAntigo =
    (lancamentoFallback && lancamentoFallback.entregadorNome) || "Sem vínculo";
  box.innerHTML = `<span>Não vinculado a cadastro (atual: <strong>${escaparHTML(nomeAntigo)}</strong>). Selecione acima para vincular.</span>`;
}

function selecionarEntregadorEdicaoLanc(idEntregador) {
  const ent = entregadores.find((e) => e.id === idEntregador);
  if (!ent) return;

  document.getElementById("edit-lanc-entregador-id").value = ent.id;
  document.getElementById("busca-entregador-edicao").value =
    `${ent.nome} (${ent.funcao} • CHAPA ${ent.chapa || "-"})`;
  document.getElementById("edit-lanc-tarifa").value = formatarMoedaBR(ent.tarifa);

  atualizarResumoEdicaoLanc(ent);
  atualizarPreviaEdicaoLancamento();
  fecharListaEdicaoLanc();
}

function atualizarPreviaEdicaoLancamento() {
  const tarifa = moedaParaNumero(
    document.getElementById("edit-lanc-tarifa").value
  );
  const qtd = parseInt(
    document.getElementById("edit-lanc-quantidade").value || "0",
    10
  );
  const total = tarifa > 0 && qtd > 0 ? tarifa * qtd : 0;
  document.getElementById("edit-lanc-comissao").value = formatarMoedaBR(total);
}

function abrirModalEditarLancamento(idLancamento) {
  const lanc = lancamentosEntregas.find((l) => l.id === idLancamento);
  const modal = document.getElementById("modal-editar-lancamento");
  if (!lanc || !modal) return;

  document.getElementById("edit-lanc-id").value = lanc.id;
  document.getElementById("edit-lanc-data").value = lanc.data || "";
  document.getElementById("edit-lanc-loja").value =
    lanc.loja || "Loja 8 - Vila Isa";
  document.getElementById("edit-lanc-quantidade").value = lanc.quantidade || 1;
  document.getElementById("edit-lanc-observacao").value = lanc.observacao || "";

  let entVinculado = entregadores.find((e) => e.id === lanc.entregadorId);
  if (!entVinculado && lanc.entregadorChapa) {
    entVinculado = entregadores.find(
      (e) =>
        e.chapa &&
        e.chapa.trim().toLowerCase() ===
          lanc.entregadorChapa.trim().toLowerCase()
    );
  }
  if (!entVinculado && lanc.entregadorNome) {
    entVinculado = entregadores.find(
      (e) =>
        normalizarTextoBusca(e.nome) ===
        normalizarTextoBusca(lanc.entregadorNome)
    );
  }

  const tarifaBase =
    (entVinculado && entVinculado.tarifa > 0
      ? entVinculado.tarifa
      : lanc.tarifaUnitaria) || 0;

  document.getElementById("edit-lanc-tarifa").value =
    formatarMoedaBR(tarifaBase);

  if (entVinculado) {
    document.getElementById("edit-lanc-entregador-id").value = entVinculado.id;
    document.getElementById("busca-entregador-edicao").value =
      `${entVinculado.nome} (${entVinculado.funcao} • CHAPA ${entVinculado.chapa || "-"})`;
    atualizarResumoEdicaoLanc(entVinculado);
  } else {
    document.getElementById("edit-lanc-entregador-id").value =
      lanc.entregadorId || "";
    document.getElementById("busca-entregador-edicao").value =
      lanc.entregadorNome || "";
    atualizarResumoEdicaoLanc(null, lanc);
  }

  atualizarPreviaEdicaoLancamento();
  fecharListaEdicaoLanc();
  modal.classList.add("ativo");
}

function fecharModalEditarLancamento() {
  const modal = document.getElementById("modal-editar-lancamento");
  fecharListaEdicaoLanc();
  if (modal) modal.classList.remove("ativo");
}

async function salvarEdicaoLancamento(evento) {
  if (evento) evento.preventDefault();

  const idLanc = document.getElementById("edit-lanc-id").value.trim();
  const idx = lancamentosEntregas.findIndex((l) => l.id === idLanc);
  if (idx === -1) return;

  const original = lancamentosEntregas[idx];
  const entId = document.getElementById("edit-lanc-entregador-id").value.trim();
  const entCadastro = entregadores.find((e) => e.id === entId);

  const data = document.getElementById("edit-lanc-data").value;
  const loja = document.getElementById("edit-lanc-loja").value;
  const quantidade = parseInt(
    document.getElementById("edit-lanc-quantidade").value || "0",
    10
  );
  const tarifaUnitaria = moedaParaNumero(
    document.getElementById("edit-lanc-tarifa").value
  );
  const observacao = document.getElementById("edit-lanc-observacao").value.trim();
  const btnSalvar = document.getElementById("btn-salvar-edicao-lancamento");

  if (!data || !loja || quantidade <= 0 || tarifaUnitaria <= 0) {
    alert("Verifique data, loja, quantidade e tarifa antes de salvar.");
    return;
  }

  const valorComissao = Number((tarifaUnitaria * quantidade).toFixed(2));
  const atualizado = {
    ...original,
    data,
    loja,
    entregadorId: entCadastro ? entCadastro.id : original.entregadorId,
    entregadorNome: entCadastro ? entCadastro.nome : original.entregadorNome,
    entregadorChapa: entCadastro ? entCadastro.chapa : original.entregadorChapa,
    funcao: entCadastro ? entCadastro.funcao : original.funcao,
    tarifaUnitaria,
    quantidade,
    valorComissao,
    observacao,
  };

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
  }

  lancamentosEntregas[idx] = atualizado;
  salvarDadosLocais();
  fecharModalEditarLancamento();
  renderizarTudo();

  try {
    atualizarStatusBanco("carregando", "Banco: atualizando lançamento...");
    const resp = await enviarRequisicaoBanco({
      acao: "salvarLancamentoEntrega",
      lancamento: atualizado,
    });
    if (resp && resp.sucesso === false) {
      throw new Error(resp.erro || "Erro ao atualizar lançamento no banco.");
    }
    atualizarStatusBanco("ok", "Banco: lançamento atualizado");
  } catch (e) {
    console.warn("Erro ao atualizar lançamento no banco:", e);
    atualizarStatusBanco("erro", "Banco: erro ao atualizar (mantido local)");
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Alterações";
    }
  }
}

function limparCamposEntregadorModal() {
  const nome = document.getElementById("ent-nome");
  const chapa = document.getElementById("ent-chapa");
  const funcao = document.getElementById("ent-funcao");
  const status = document.getElementById("ent-status");
  const tarifa = document.getElementById("ent-tarifa");
  const cpf = document.getElementById("ent-cpf");
  const telefone = document.getElementById("ent-telefone");

  if (nome) nome.value = "";
  if (chapa) chapa.value = "";
  if (funcao) funcao.value = "Motorista";
  if (status) status.value = "Ativo";
  if (tarifa) tarifa.value = "";
  if (cpf) {
    cpf.value = "";
    cpf.setCustomValidity("");
  }
  if (telefone) telefone.value = "";
  if (nome) nome.focus();
}

function abrirModalEntregador(idEntregador = null) {
  const modal = document.getElementById("modal-entregador");
  const titulo = document.getElementById("titulo-modal-entregador");
  const campoId = document.getElementById("entregador-id-edicao");
  const nome = document.getElementById("ent-nome");
  const chapa = document.getElementById("ent-chapa");
  const funcao = document.getElementById("ent-funcao");
  const status = document.getElementById("ent-status");
  const tarifa = document.getElementById("ent-tarifa");
  const cpf = document.getElementById("ent-cpf");
  const telefone = document.getElementById("ent-telefone");

  if (!modal) return;

  if (cpf) cpf.setCustomValidity("");

  if (idEntregador) {
    const item = entregadores.find((e) => e.id === idEntregador);
    if (!item) return;

    titulo.textContent = "Editar Entregador";
    campoId.value = item.id;
    nome.value = item.nome;
    chapa.value = item.chapa;
    funcao.value = item.funcao;
    if (status) status.value = normalizarStatusEntregador(item.status);
    tarifa.value = formatarMoedaBR(item.tarifa);
    cpf.value = item.cpf;
    telefone.value = item.telefone;
  } else {
    titulo.textContent = "Cadastrar Entregador";
    campoId.value = "";
    nome.value = "";
    chapa.value = "";
    funcao.value = "Motorista";
    if (status) status.value = "Ativo";
    tarifa.value = "";
    cpf.value = "";
    telefone.value = "";
  }

  modal.classList.add("ativo");

  setTimeout(() => {
    if (nome) nome.focus();
  }, 40);
}

function fecharModalEntregador() {
  const modal = document.getElementById("modal-entregador");
  if (modal) modal.classList.remove("ativo");
}

async function salvarEntregador(evento) {
  if (evento) evento.preventDefault();

  const idEdicao = document.getElementById("entregador-id-edicao").value.trim();
  const nome = document.getElementById("ent-nome").value.trim();
  const chapa = document.getElementById("ent-chapa").value.trim();
  const funcao = document.getElementById("ent-funcao").value;
  const status = normalizarStatusEntregador(
    document.getElementById("ent-status").value
  );
  const tarifa = moedaParaNumero(document.getElementById("ent-tarifa").value);
  const campoCpf = document.getElementById("ent-cpf");
  const cpf = campoCpf.value.trim();
  const telefone = document.getElementById("ent-telefone").value.trim();
  const btnSalvar = document.getElementById("btn-salvar-entregador");

  if (!nome || !chapa || !cpf || !telefone || tarifa <= 0) {
    alert("Preencha todos os campos do entregador com uma tarifa maior que R$ 0,00.");
    return;
  }

  if (!validarCPFEntrega(cpf)) {
    campoCpf.setCustomValidity("CPF inválido. Verifique os números digitados.");
    campoCpf.reportValidity();
    return;
  }
  campoCpf.setCustomValidity("");

  const chapaDuplicada = entregadores.some(
    (e) =>
      e.chapa.toLowerCase() === chapa.toLowerCase() &&
      (!idEdicao || e.id !== idEdicao)
  );
  if (chapaDuplicada) {
    alert("Já existe outro entregador cadastrado com essa CHAPA.");
    return;
  }

  const idSalvo = idEdicao || "ENT-" + Date.now();
  const registro = {
    id: idSalvo,
    nome,
    chapa,
    funcao,
    tarifa,
    cpf,
    telefone,
    status,
  };

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
  }

  if (idEdicao) {
    const idx = entregadores.findIndex((e) => e.id === idEdicao);
    if (idx !== -1) entregadores[idx] = registro;
  } else {
    entregadores.push(registro);
  }

  salvarDadosLocais();
  fecharModalEntregador();
  renderizarTudo();

  if (status === "Ativo") {
    selecionarEntregadorLancamento(idSalvo);
  }

  try {
    atualizarStatusBanco("carregando", "Banco: salvando entregador...");
    const resp = await enviarRequisicaoBanco({
      acao: "salvarEntregador",
      entregador: registro,
    });
    if (resp && resp.sucesso === false) {
      throw new Error(resp.erro || "Erro ao salvar entregador no banco.");
    }
    atualizarStatusBanco("ok", "Banco: entregador salvo");
  } catch (e) {
    console.warn("Erro ao salvar entregador no banco:", e);
    atualizarStatusBanco("erro", "Banco: erro ao salvar (mantido local)");
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar Entregador";
    }
  }
}

async function alternarStatusEntregador(idEntregador) {
  const idx = entregadores.findIndex((e) => e.id === idEntregador);
  if (idx === -1) return;

  const atual = entregadores[idx];
  const novoStatus =
    normalizarStatusEntregador(atual.status) === "Ativo" ? "Inativo" : "Ativo";

  const atualizado = {
    ...atual,
    status: novoStatus,
  };

  entregadores[idx] = atualizado;
  salvarDadosLocais();
  renderizarTudo();

  try {
    atualizarStatusBanco("carregando", "Banco: atualizando situação...");
    const resp = await enviarRequisicaoBanco({
      acao: "salvarEntregador",
      entregador: atualizado,
    });
    if (resp && resp.sucesso === false) {
      throw new Error(resp.erro || "Erro ao atualizar situação no banco.");
    }
    atualizarStatusBanco("ok", `Banco: entregador ${novoStatus.toLowerCase()}`);
  } catch (e) {
    console.warn("Erro ao atualizar situação no banco:", e);
    atualizarStatusBanco("erro", "Banco: erro ao atualizar (mantido local)");
  }
}

function renderizarTabelaEntregadores() {
  const tbody = document.getElementById("corpo-tabela-entregadores");
  if (!tbody) return;

  const filtroStatus =
    (document.getElementById("filtro-status-entregadores") &&
      document.getElementById("filtro-status-entregadores").value) ||
    "Ativo";
  const filtroFuncao =
    (document.getElementById("filtro-funcao-entregadores") &&
      document.getElementById("filtro-funcao-entregadores").value) ||
    "TODOS";
  const busca = normalizarTextoBusca(
    document.getElementById("filtro-busca-entregadores") &&
      document.getElementById("filtro-busca-entregadores").value
  );

  const filtrados = entregadores
    .filter((e) => {
      const statusAtual = normalizarStatusEntregador(e.status);
      if (filtroStatus !== "TODOS" && statusAtual !== filtroStatus) return false;
      if (filtroFuncao !== "TODOS" && e.funcao !== filtroFuncao) return false;
      if (busca) {
        const matchNome = normalizarTextoBusca(e.nome).includes(busca);
        const matchChapa = normalizarTextoBusca(e.chapa).includes(busca);
        const matchCpf = normalizarTextoBusca(e.cpf).includes(busca);
        if (!matchNome && !matchChapa && !matchCpf) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  if (paginaEntregadores > totalPaginas) {
    paginaEntregadores = totalPaginas;
  }

  const inicio = (paginaEntregadores - 1) * ITENS_POR_PAGINA;
  const paginaAtualItens = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);

  if (paginaAtualItens.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #64748b; padding: 18px;">
          Nenhum entregador encontrado para o filtro selecionado.
        </td>
      </tr>
    `;
    renderizarControlesPaginacao(
      "paginacao-entregadores",
      0,
      1,
      "mudarPaginaEntregadores"
    );
    return;
  }

  tbody.innerHTML = paginaAtualItens
    .map((e) => {
      const statusAtual = normalizarStatusEntregador(e.status);
      const classeFuncao =
        e.funcao === "Motorista"
          ? "badge-funcao-motorista"
          : "badge-funcao-ajudante";
      const classeStatus =
        statusAtual === "Ativo"
          ? "badge-status-ativo"
          : "badge-status-inativo";
      const textoBotaoStatus = statusAtual === "Ativo" ? "Inativar" : "Ativar";

      return `
      <tr>
        <td><strong>${escaparHTML(e.chapa || "-")}</strong></td>
        <td><strong>${escaparHTML(e.nome)}</strong></td>
        <td><span class="badge ${classeFuncao}">${escaparHTML(e.funcao)}</span></td>
        <td><span class="badge ${classeStatus}">${statusAtual}</span></td>
        <td>${escaparHTML(e.telefone || "-")}</td>
        <td>${escaparHTML(e.cpf || "-")}</td>
        <td><strong>${formatarMoedaBR(e.tarifa)}</strong></td>
        <td style="text-align: right; white-space: nowrap">
          <button
            type="button"
            class="btn-azul"
            style="padding: 5px 10px; font-size: 12px"
            onclick="abrirModalEntregador('${e.id}')"
          >
            Editar
          </button>
          <button
            type="button"
            class="btn-paginacao"
            style="padding: 5px 10px; font-size: 12px; margin-left: 4px"
            onclick="alternarStatusEntregador('${e.id}')"
          >
            ${textoBotaoStatus}
          </button>
        </td>
      </tr>
    `;
    })
    .join("");

  renderizarControlesPaginacao(
    "paginacao-entregadores",
    filtrados.length,
    paginaEntregadores,
    "mudarPaginaEntregadores"
  );
}

function atualizarPreviaComissao() {
  const idEntregador = document.getElementById("entrega-entregador").value;
  const qtd = parseInt(document.getElementById("entrega-quantidade").value || "0", 10);
  const campoPrevia = document.getElementById("entrega-previa-comissao");

  const entregador = entregadores.find((e) => e.id === idEntregador);
  if (!entregador || qtd <= 0) {
    campoPrevia.value = formatarMoedaBR(0);
    return;
  }

  campoPrevia.value = formatarMoedaBR(entregador.tarifa * qtd);
}

async function salvarLancamentoEntrega(evento) {
  if (evento) evento.preventDefault();

  const data = document.getElementById("entrega-data").value;
  const loja = document.getElementById("entrega-loja").value;
  const idEntregador = document.getElementById("entrega-entregador").value;
  const quantidade = parseInt(
    document.getElementById("entrega-quantidade").value || "0",
    10
  );
  const observacao = document.getElementById("entrega-observacao").value.trim();
  const sessao = typeof obterSessaoAtual === "function" ? obterSessaoAtual() : null;
  const lancadoPor =
    (sessao && sessao.nome) ||
    document.getElementById("entrega-lancado-por").value.trim() ||
    "Não identificado";
  const btnLancar = document.getElementById("btn-lancar-entrega");

  const entregador = entregadores.find((e) => e.id === idEntregador);
  if (!entregador) {
    alert("Selecione um entregador da lista antes de lançar.");
    const inputBusca = document.getElementById("busca-entregador-lancamento");
    if (inputBusca) {
      inputBusca.focus();
      abrirListaLancamento();
    }
    return;
  }

  if (!data || !loja || quantidade <= 0) {
    alert("Preencha data, loja e uma quantidade de entregas maior que zero.");
    return;
  }

  const valorComissao = Number((entregador.tarifa * quantidade).toFixed(2));
  const novoLancamento = {
    id: "LANC-" + Date.now(),
    data,
    loja,
    entregadorId: entregador.id,
    entregadorNome: entregador.nome,
    entregadorChapa: entregador.chapa,
    funcao: entregador.funcao,
    tarifaUnitaria: entregador.tarifa,
    quantidade,
    valorComissao,
    observacao,
    lancadoPor,
  };

  if (btnLancar) {
    btnLancar.disabled = true;
    btnLancar.textContent = "Lançando...";
  }

  lancamentosEntregas.push(novoLancamento);
  salvarDadosLocais();

  document.getElementById("entrega-quantidade").value = "";
  document.getElementById("entrega-observacao").value = "";
  document.getElementById("entrega-previa-comissao").value = formatarMoedaBR(0);
  document.getElementById("entrega-entregador").value = "";
  document.getElementById("busca-entregador-lancamento").value = "";
  atualizarResumoEntregadorLancamento(null);

  const elInicio = document.getElementById("filtro-data-inicio");
  const elFim = document.getElementById("filtro-data-fim");
  if (elInicio && (!elInicio.value || data < elInicio.value)) {
    elInicio.value = data;
  }
  if (elFim && (!elFim.value || data > elFim.value)) {
    elFim.value = data;
  }

  preencherOperadorLogado();

  paginaHistorico = 1;
  renderizarTudo();

  try {
    atualizarStatusBanco("carregando", "Banco: gravando lançamento...");
    const resp = await enviarRequisicaoBanco({
      acao: "salvarLancamentoEntrega",
      lancamento: novoLancamento,
    });
    if (resp && resp.sucesso === false) {
      throw new Error(resp.erro || "Erro ao gravar lançamento no banco.");
    }
    atualizarStatusBanco("ok", "Banco: lançamento gravado");
  } catch (e) {
    console.warn("Erro ao gravar lançamento no banco:", e);
    atualizarStatusBanco("erro", "Banco: erro ao gravar (mantido local)");
  } finally {
    if (btnLancar) {
      btnLancar.disabled = false;
      btnLancar.textContent = "+ Lançar Entregas";
    }
  }
}

async function excluirLancamentoEntrega(idLancamento) {
  if (!confirm("Deseja remover este lançamento de entregas?")) return;

  lancamentosEntregas = lancamentosEntregas.filter((l) => l.id !== idLancamento);
  salvarDadosLocais();
  renderizarTudo();

  try {
    atualizarStatusBanco("carregando", "Banco: removendo registro...");
    const resp = await enviarRequisicaoBanco({
      acao: "excluirLancamentoEntrega",
      id: idLancamento,
    });
    if (resp && resp.sucesso === false) {
      throw new Error(resp.erro || "Erro ao excluir registro no banco.");
    }
    atualizarStatusBanco("ok", "Banco: registro removido");
  } catch (e) {
    console.warn("Erro ao remover lançamento no banco:", e);
    atualizarStatusBanco("erro", "Banco: erro ao remover no servidor");
  }
}

function obterPeriodoSelecionado() {
  const elInicio = document.getElementById("filtro-data-inicio");
  const elFim = document.getElementById("filtro-data-fim");
  const hoje = obterDataHojeISO();

  let dataInicio = (elInicio && elInicio.value) || obterPrimeiroDiaMesISO(hoje);
  let dataFim = (elFim && elFim.value) || hoje;

  if (dataInicio && dataFim && dataInicio > dataFim) {
    const temp = dataInicio;
    dataInicio = dataFim;
    dataFim = temp;
    if (elInicio) elInicio.value = dataInicio;
    if (elFim) elFim.value = dataFim;
  }

  return { dataInicio, dataFim };
}

function obterPeriodoRelatorioPDF() {
  const elInicio = document.getElementById("pdf-data-inicio");
  const elFim = document.getElementById("pdf-data-fim");
  const hoje = obterDataHojeISO();

  let dataInicio = (elInicio && elInicio.value) || obterPrimeiroDiaMesISO(hoje);
  let dataFim = (elFim && elFim.value) || hoje;

  if (dataInicio && dataFim && dataInicio > dataFim) {
    const temp = dataInicio;
    dataInicio = dataFim;
    dataFim = temp;
    if (elInicio) elInicio.value = dataInicio;
    if (elFim) elFim.value = dataFim;
  }

  return { dataInicio, dataFim };
}

function formatarDescricaoPeriodo(dataInicio, dataFim) {
  const iniBR = formatarDataISOparaBR(dataInicio);
  const fimBR = formatarDataISOparaBR(dataFim);
  return iniBR === fimBR ? iniBR : `${iniBR} a ${fimBR}`;
}

function aoAlterarPeriodoFiltro() {
  paginaHistorico = 1;
  renderizarHistorico();
  atualizarKPIs();
}

function aoAlterarLojaFiltro() {
  const lojaFiltro = document.getElementById("filtro-loja-historico").value;
  const pdfLoja = document.getElementById("pdf-loja");
  if (pdfLoja) {
    pdfLoja.value = lojaFiltro;
  }
  paginaHistorico = 1;
  renderizarHistorico();
}

function calcularTotaisPorDia() {
  const totaisDia = {};
  lancamentosEntregas.forEach((l) => {
    if (!totaisDia[l.data]) {
      totaisDia[l.data] = { entregas: 0, comissao: 0 };
    }
    totaisDia[l.data].entregas += Number(l.quantidade) || 0;
    totaisDia[l.data].comissao += Number(l.valorComissao) || 0;
  });
  return totaisDia;
}

function renderizarHistorico() {
  const tbody = document.getElementById("corpo-tabela-historico");
  if (!tbody) return;

  const { dataInicio, dataFim } = obterPeriodoSelecionado();
  const lojaFiltro = document.getElementById("filtro-loja-historico").value;
  const funcaoFiltro = document.getElementById("filtro-funcao-historico").value;
  const ordemData =
    (document.getElementById("ordem-data-historico") &&
      document.getElementById("ordem-data-historico").value) ||
    "DESC";
  const busca = normalizarTextoBusca(
    document.getElementById("filtro-busca-historico") &&
      document.getElementById("filtro-busca-historico").value
  );

  const totaisDia = calcularTotaisPorDia();

  const filtrados = lancamentosEntregas
    .filter((l) => {
      if (dataInicio && l.data < dataInicio) return false;
      if (dataFim && l.data > dataFim) return false;
      if (lojaFiltro !== "TODAS" && l.loja !== lojaFiltro) return false;
      if (funcaoFiltro !== "TODOS" && l.funcao !== funcaoFiltro) return false;
      if (busca) {
        const matchNome = normalizarTextoBusca(l.entregadorNome).includes(busca);
        const matchChapa = normalizarTextoBusca(l.entregadorChapa).includes(busca);
        if (!matchNome && !matchChapa) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const cmpData = (a.data || "").localeCompare(b.data || "");
      if (cmpData !== 0) {
        return ordemData === "ASC" ? cmpData : -cmpData;
      }
      return (a.entregadorNome || "").localeCompare(
        b.entregadorNome || "",
        "pt-BR"
      );
    });

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  if (paginaHistorico > totalPaginas) {
    paginaHistorico = totalPaginas;
  }

  const inicio = (paginaHistorico - 1) * ITENS_POR_PAGINA;
  const paginaAtualItens = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);

  if (paginaAtualItens.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #64748b; padding: 18px;">
          Nenhum lançamento encontrado no período selecionado.
        </td>
      </tr>
    `;
    renderizarControlesPaginacao(
      "paginacao-historico",
      0,
      1,
      "mudarPaginaHistorico"
    );
    return;
  }

  tbody.innerHTML = paginaAtualItens
    .map((l) => {
      const resumoDia = totaisDia[l.data] || { entregas: 0, comissao: 0 };
      const responsavel = l.lancadoPor || "Não identificado";
      const cadastroVinculado = entregadores.find(
        (e) => e.id === l.entregadorId
      );
      const chapaExibir =
        (cadastroVinculado && cadastroVinculado.chapa) ||
        l.entregadorChapa ||
        "-";
      const tagSemVinculo =
        !cadastroVinculado || !chapaExibir || chapaExibir === "-"
          ? `<span class="badge-vinculo-pendente" title="Clique em Editar para vincular ao cadastro">Vincular</span>`
          : "";

      return `
        <tr>
          <td><strong>${formatarDataISOparaBR(l.data)}</strong></td>
          <td>
            <strong>${escaparHTML(l.entregadorNome)}</strong>${tagSemVinculo}<br>
            <small style="color: #64748b;">${escaparHTML(l.funcao)} • CHAPA ${escaparHTML(chapaExibir)} • ${escaparHTML(l.loja)}</small>
          </td>
          <td><strong>${l.quantidade}</strong></td>
          <td>${formatarMoedaBR(l.valorComissao)}</td>
          <td><strong>${formatarMoedaBR(resumoDia.comissao)}</strong></td>
          <td><small style="color: #334155; font-weight: 600;">${escaparHTML(responsavel)}</small></td>
          <td style="text-align: right; white-space: nowrap">
            <button
              type="button"
              class="btn-azul"
              style="padding: 5px 10px; font-size: 12px; margin-right: 4px"
              onclick="abrirModalEditarLancamento('${l.id}')"
            >
              Editar
            </button>
            <button
              type="button"
              class="btn-remover"
              onclick="excluirLancamentoEntrega('${l.id}')"
            >
              Excluir
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  renderizarControlesPaginacao(
    "paginacao-historico",
    filtrados.length,
    paginaHistorico,
    "mudarPaginaHistorico"
  );
}

function atualizarKPIs() {
  const elData = document.getElementById("entrega-data");
  const dataRef = (elData && elData.value) || obterDataHojeISO();
  const { dataInicio, dataFim } = obterPeriodoSelecionado();

  let entregasDia = 0;
  let comissaoDia = 0;
  let comissaoPeriodo = 0;

  lancamentosEntregas.forEach((l) => {
    const qtd = Number(l.quantidade) || 0;
    const com = Number(l.valorComissao) || 0;
    const funcaoNorm = normalizarTextoBusca(l.funcao);

    if (l.data === dataRef) {
      if (funcaoNorm !== "ajudante") {
        entregasDia += qtd;
      }
      comissaoDia += com;
    }
    if ((!dataInicio || l.data >= dataInicio) && (!dataFim || l.data <= dataFim)) {
      comissaoPeriodo += com;
    }
  });

  const totalAtivos = entregadores.filter(
    (e) => normalizarStatusEntregador(e.status) === "Ativo"
  ).length;

  document.getElementById("kpi-entregas-dia").textContent = String(entregasDia);
  document.getElementById("kpi-comissao-dia").textContent =
    formatarMoedaBR(comissaoDia);
  document.getElementById("kpi-comissao-periodo").textContent =
    formatarMoedaBR(comissaoPeriodo);
  document.getElementById("kpi-total-entregadores").textContent = String(
    totalAtivos
  );
}

function gerarRelatorioSetorPDF() {
  const { dataInicio, dataFim } = obterPeriodoRelatorioPDF();
  const lojaFiltro = document.getElementById("pdf-loja").value || "TODAS";
  const entregadorIdFiltro =
    document.getElementById("pdf-entregador").value || "TODOS";

  const registros = lancamentosEntregas
    .filter((l) => {
      if (dataInicio && l.data < dataInicio) return false;
      if (dataFim && l.data > dataFim) return false;
      if (lojaFiltro !== "TODAS" && l.loja !== lojaFiltro) return false;
      if (entregadorIdFiltro !== "TODOS" && l.entregadorId !== entregadorIdFiltro) {
        return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data));

  if (registros.length === 0) {
    alert("Não há lançamentos de entregas para o período e filtro selecionados.");
    return;
  }

  const entIndividual =
    entregadorIdFiltro !== "TODOS"
      ? entregadores.find((e) => e.id === entregadorIdFiltro)
      : null;

  const tituloRelatorio = entIndividual
    ? `Relatório Individual de Entregas — ${entIndividual.nome} (CHAPA ${entIndividual.chapa || "-"})`
    : "Relatório Geral de Entregas do Setor";

  const periodoTexto = formatarDescricaoPeriodo(dataInicio, dataFim);
  const lojaTexto = lojaFiltro === "TODAS" ? "Todas as Lojas" : lojaFiltro;
  const sessao = typeof obterSessaoAtual === "function" ? obterSessaoAtual() : null;
  const emitidoPor = (sessao && sessao.nome) || "Portal Bigmais em Casa";
  const emitidoEm = new Date().toLocaleString("pt-BR");

  const mapaResumo = new Map();
  registros.forEach((r) => {
    const chave = r.entregadorId || `${r.entregadorChapa}-${r.entregadorNome}`;
    if (!mapaResumo.has(chave)) {
      mapaResumo.set(chave, {
        chapa: r.entregadorChapa,
        nome: r.entregadorNome,
        funcao: r.funcao,
        diasTrabalhados: new Set(),
        totalEntregas: 0,
        totalComissao: 0,
      });
    }
    const item = mapaResumo.get(chave);
    item.diasTrabalhados.add(r.data);
    item.totalEntregas += Number(r.quantidade) || 0;
    item.totalComissao = Number(
      (item.totalComissao + (Number(r.valorComissao) || 0)).toFixed(2)
    );
  });

  const resumoEntregadores = Array.from(mapaResumo.values());
  const totalGeralEntregas = registros.reduce(
    (acc, r) => acc + (Number(r.quantidade) || 0),
    0
  );
  const totalGeralComissao = Number(
    registros
      .reduce((acc, r) => acc + (Number(r.valorComissao) || 0), 0)
      .toFixed(2)
  );

  const linhasResumoHTML = resumoEntregadores
    .map(
      (item) => `
      <tr>
        <td>${escaparHTML(item.chapa || "-")}</td>
        <td><strong>${escaparHTML(item.nome)}</strong></td>
        <td>${escaparHTML(item.funcao)}</td>
        <td style="text-align: center">${item.diasTrabalhados.size}</td>
        <td style="text-align: center"><strong>${item.totalEntregas}</strong></td>
        <td style="text-align: right"><strong>${escaparHTML(formatarMoedaBR(item.totalComissao))}</strong></td>
      </tr>`
    )
    .join("");

  const linhasDetalhadasHTML = registros
    .map(
      (r) => `
      <tr>
        <td>${escaparHTML(formatarDataISOparaBR(r.data))}</td>
        <td>${escaparHTML(r.loja)}</td>
        <td>${escaparHTML(r.entregadorNome)} <small style="color:#64748b">(${escaparHTML(r.funcao)} • ${escaparHTML(r.entregadorChapa || "-")})</small></td>
        <td style="text-align: center"><strong>${r.quantidade}</strong></td>
        <td style="text-align: right">${escaparHTML(formatarMoedaBR(r.tarifaUnitaria))}</td>
        <td style="text-align: right"><strong>${escaparHTML(formatarMoedaBR(r.valorComissao))}</strong></td>
        <td>${escaparHTML(r.lancadoPor || "-")}</td>
        <td>${escaparHTML(r.observacao || "-")}</td>
      </tr>`
    )
    .join("");

  const janelaPDF = window.open("", "_blank", "width=1024,height=768");
  if (!janelaPDF) {
    alert("Permita pop-ups no navegador para abrir o relatório em PDF.");
    return;
  }

  const nomeArquivoSugerido = entIndividual
    ? `relatorio-setor-${slugTextoArquivo(entIndividual.nome)}-${dataInicio}-a-${dataFim}`
    : `relatorio-setor-geral-${dataInicio}-a-${dataFim}`;

  janelaPDF.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escaparHTML(nomeArquivoSugerido)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 14mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: #1e293b;
        margin: 0;
        padding: 16px;
        background: #ffffff;
        font-size: 12px;
      }
      .topo-pdf {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 3px solid #d32f2f;
        padding-bottom: 12px;
        margin-bottom: 16px;
      }
      .topo-pdf h1 {
        margin: 0;
        font-size: 18px;
        color: #b71c1c;
      }
      .topo-pdf p {
        margin: 3px 0 0;
        font-size: 12px;
        color: #475569;
      }
      .meta-pdf {
        text-align: right;
        font-size: 11px;
        color: #475569;
        line-height: 1.5;
      }
      .barra-acao-pdf {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-bottom: 14px;
      }
      .btn-imprimir {
        background: #d32f2f;
        color: #ffffff;
        border: none;
        padding: 9px 16px;
        border-radius: 6px;
        font-weight: 700;
        cursor: pointer;
        font-size: 13px;
      }
      .cards-resumo {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 18px;
      }
      .card-resumo {
        border: 1px solid #cbd5e1;
        border-left: 4px solid #d32f2f;
        border-radius: 6px;
        padding: 10px 12px;
        background: #f8fafc;
      }
      .card-resumo span {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 700;
      }
      .card-resumo strong {
        display: block;
        font-size: 17px;
        color: #0f172a;
        margin-top: 3px;
      }
      h2 {
        font-size: 13.5px;
        color: #1e293b;
        border-left: 4px solid #d32f2f;
        padding-left: 8px;
        margin: 16px 0 8px;
        text-transform: uppercase;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
      }
      th {
        background: #f1f5f9;
        color: #1e293b;
        font-weight: 700;
        text-align: left;
        padding: 7px 8px;
        border: 1px solid #cbd5e1;
        font-size: 11px;
      }
      td {
        padding: 6px 8px;
        border: 1px solid #e2e8f0;
        font-size: 11.5px;
      }
      tr:nth-child(even) td {
        background: #f8fafc;
      }
      tfoot td {
        background: #fef2f2 !important;
        font-weight: 700;
        border-top: 2px solid #d32f2f;
      }
      .rodape-pdf {
        margin-top: 18px;
        padding-top: 8px;
        border-top: 1px solid #cbd5e1;
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        color: #64748b;
      }
      @media print {
        .barra-acao-pdf {
          display: none !important;
        }
        body {
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="barra-acao-pdf">
      <button type="button" class="btn-imprimir" onclick="window.print()">
        Salvar em PDF / Imprimir
      </button>
    </div>

    <div class="topo-pdf">
      <div>
        <h1>Portal Bigmais em Casa</h1>
        <p><strong>${escaparHTML(tituloRelatorio)}</strong></p>
      </div>
      <div class="meta-pdf">
        <div><strong>Período:</strong> ${escaparHTML(periodoTexto)}</div>
        <div><strong>Unidade:</strong> ${escaparHTML(lojaTexto)}</div>
        <div><strong>Emitido em:</strong> ${escaparHTML(emitidoEm)}</div>
      </div>
    </div>

    <div class="cards-resumo">
      <div class="card-resumo">
        <span>Entregadores no Período</span>
        <strong>${resumoEntregadores.length}</strong>
      </div>
      <div class="card-resumo">
        <span>Total de Entregas</span>
        <strong>${totalGeralEntregas}</strong>
      </div>
      <div class="card-resumo">
        <span>Total de Comissão</span>
        <strong>${escaparHTML(formatarMoedaBR(totalGeralComissao))}</strong>
      </div>
    </div>

    <h2>Resumo Consolidado por Entregador</h2>
    <table>
      <thead>
        <tr>
          <th>CHAPA</th>
          <th>Nome</th>
          <th>Função</th>
          <th style="text-align: center">Dias</th>
          <th style="text-align: center">Total Entregas</th>
          <th style="text-align: right">Comissão Total</th>
        </tr>
      </thead>
      <tbody>
        ${linhasResumoHTML}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">TOTAL GERAL DO PERÍODO</td>
          <td style="text-align: center">${totalGeralEntregas}</td>
          <td style="text-align: right">${escaparHTML(formatarMoedaBR(totalGeralComissao))}</td>
        </tr>
      </tfoot>
    </table>

    <h2>Detalhamento Diário dos Lançamentos</h2>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Loja</th>
          <th>Entregador</th>
          <th style="text-align: center">Qtd.</th>
          <th style="text-align: right">Tarifa</th>
          <th style="text-align: right">Comissão</th>
          <th>Lançado por</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${linhasDetalhadasHTML}
      </tbody>
    </table>

    <div class="rodape-pdf">
      <span>Uso interno do setor • Portal Bigmais em Casa</span>
      <span>Emitido por: ${escaparHTML(emitidoPor)}</span>
    </div>

    <script>
      window.onload = function () {
        setTimeout(function () {
          window.print();
        }, 250);
      };
    <\/script>
  </body>
</html>`);
  janelaPDF.document.close();
}

function consolidarComissoesMesPorLoja(mesRef, lojaRef) {
  const mapa = new Map();

  const lancamentosFiltrados = lancamentosEntregas.filter((l) => {
    if (!(l.data || "").startsWith(mesRef)) return false;
    if (lojaRef !== "TODAS" && l.loja !== lojaRef) return false;
    return true;
  });

  lancamentosFiltrados.forEach((l) => {
    const chave = `${l.loja}__${l.entregadorId || `${l.entregadorChapa}-${l.entregadorNome}`}`;
    const cadastro = entregadores.find((e) => e.id === l.entregadorId);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        loja: l.loja,
        nome: (cadastro && cadastro.nome) || l.entregadorNome,
        chapa: (cadastro && cadastro.chapa) || l.entregadorChapa,
        funcao: (cadastro && cadastro.funcao) || l.funcao,
        cpf: (cadastro && cadastro.cpf) || "",
        tarifaUnitaria:
          cadastro && cadastro.tarifa != null
            ? cadastro.tarifa
            : l.tarifaUnitaria || 0,
        totalEntregas: 0,
        totalComissao: 0,
        lancadoPorSet: new Set(),
        lancamentosDetalhe: [],
      });
    }

    const item = mapa.get(chave);
    const operador = l.lancadoPor || "Não identificado";

    item.totalEntregas += Number(l.quantidade) || 0;
    item.totalComissao = Number(
      (item.totalComissao + (Number(l.valorComissao) || 0)).toFixed(2)
    );
    item.lancadoPorSet.add(operador);
    item.lancamentosDetalhe.push({
      data: l.data,
      loja: l.loja,
      quantidade: Number(l.quantidade) || 0,
      tarifaUnitaria: Number(l.tarifaUnitaria) || item.tarifaUnitaria,
      valorComissao: Number(l.valorComissao) || 0,
      lancadoPor: operador,
      observacao: l.observacao || "",
    });
  });

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      lancadoPor: Array.from(item.lancadoPorSet).join(", "),
    }))
    .sort((a, b) => {
      const cmpLoja = a.loja.localeCompare(b.loja, "pt-BR");
      if (cmpLoja !== 0) return cmpLoja;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}

function montarMensagemSimplesEmail(mesRef, lojaRef, itensConsolidados) {
  const totalEntregas = itensConsolidados.reduce(
    (acc, i) => acc + i.totalEntregas,
    0
  );
  const totalComissao = itensConsolidados.reduce(
    (acc, i) => acc + i.totalComissao,
    0
  );

  const descricaoLoja =
    lojaRef === "TODAS" ? "Loja 8 - Vila Isa e Loja 9 - São Pedro" : lojaRef;

  let resumoPorLojaTexto = "";
  if (lojaRef === "TODAS") {
    const lojasUnicas = ["Loja 8 - Vila Isa", "Loja 9 - São Pedro"];
    const linhasLojas = lojasUnicas.map((lj) => {
      const itensLj = itensConsolidados.filter((i) => i.loja === lj);
      const entLj = itensLj.reduce((acc, i) => acc + i.totalEntregas, 0);
      const comLj = itensLj.reduce((acc, i) => acc + i.totalComissao, 0);
      return `  • ${lj}: ${entLj} entregas | ${formatarMoedaBR(comLj)}`;
    });
    resumoPorLojaTexto = `\nDetalhamento por unidade:\n${linhasLojas.join("\n")}\n`;
  }

  const assunto = `Relatório de Comissão de Entregas (Excel) - ${descricaoLoja} - Competência ${mesRef}`;
  const corpo = `Olá,

Segue em anexo a planilha em Excel (.xlsx) com o relatório mensal de comissão de entregas referente à competência ${mesRef} (${descricaoLoja}).

Resumo do período:
- Registros consolidados: ${itensConsolidados.length}
- Total de entregas: ${totalEntregas}
- Valor total de comissão: ${formatarMoedaBR(totalComissao)}${resumoPorLojaTexto}
Atenciosamente,`;

  return { assunto, corpo };
}

function atualizarPreviaRelatorioRH() {
  const elMes = document.getElementById("relatorio-mes");
  const elLoja = document.getElementById("relatorio-loja");
  const mesRef = (elMes && elMes.value) || obterDataHojeISO().slice(0, 7);
  const lojaRef = (elLoja && elLoja.value) || "TODAS";

  const consolidado = consolidarComissoesMesPorLoja(mesRef, lojaRef);
  const res = montarMensagemSimplesEmail(mesRef, lojaRef, consolidado);

  const descricaoLoja =
    lojaRef === "TODAS" ? "Todas as Lojas (Loja 8 + Loja 9)" : lojaRef;
  const elTitulo = document.getElementById("titulo-modal-email-comissao");
  const elAssunto = document.getElementById("email-comissao-assunto");
  const elCorpo = document.getElementById("email-comissao-corpo");

  if (elTitulo) {
    elTitulo.textContent = `Mensagem de E-mail — ${descricaoLoja} (${mesRef})`;
  }
  if (elAssunto) elAssunto.value = res.assunto;
  if (elCorpo) elCorpo.value = res.corpo;
}

function gerarEbaixarRelatorioExcel() {
  const mesRef = document.getElementById("relatorio-mes").value;
  const lojaRef = document.getElementById("relatorio-loja").value;

  if (!lojaRef || !mesRef) {
    alert("Selecione a loja e o mês de referência para gerar a planilha.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Biblioteca Excel ainda não carregou. Recarregue a página e tente novamente.");
    return;
  }

  const consolidado = consolidarComissoesMesPorLoja(mesRef, lojaRef);
  if (consolidado.length === 0) {
    alert(
      `Não há lançamentos de entregas registrados na competência ${mesRef} para o filtro selecionado.`
    );
    return;
  }

  const wb = XLSX.utils.book_new();

  const linhasResumo = consolidado.map((i) => ({
    Competencia: mesRef,
    Loja: i.loja,
    CHAPA: i.chapa,
    Nome: i.nome,
    Funcao: i.funcao,
    CPF: i.cpf,
    Qtd_Entregas: i.totalEntregas,
    Tarifa_Unitaria: Number(i.tarifaUnitaria || 0),
    Valor_Comissao: Number(i.totalComissao || 0),
    Lancado_Por: i.lancadoPor,
  }));

  const totalEntregas = consolidado.reduce((acc, i) => acc + i.totalEntregas, 0);
  const totalComissao = Number(
    consolidado.reduce((acc, i) => acc + i.totalComissao, 0).toFixed(2)
  );

  linhasResumo.push({
    Competencia: "TOTAL GERAL",
    Loja: lojaRef === "TODAS" ? "Loja 8 + Loja 9" : lojaRef,
    CHAPA: "",
    Nome: "",
    Funcao: "",
    CPF: "",
    Qtd_Entregas: totalEntregas,
    Tarifa_Unitaria: null,
    Valor_Comissao: totalComissao,
    Lancado_Por: "",
  });

  const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
  wsResumo["!cols"] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 16 },
    { wch: 15 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo_RH");

  const linhasDiarias = [];
  consolidado.forEach((i) => {
    i.lancamentosDetalhe.forEach((d) => {
      linhasDiarias.push({
        Data: formatarDataISOparaBR(d.data),
        Loja: d.loja,
        CHAPA: i.chapa,
        Nome: i.nome,
        Funcao: i.funcao,
        Qtd_Entregas: d.quantidade,
        Tarifa_Unitaria: Number(d.tarifaUnitaria || 0),
        Valor_Comissao: Number(d.valorComissao || 0),
        Lancado_Por: d.lancadoPor,
        Observacao: d.observacao,
      });
    });
  });

  const wsDiario = XLSX.utils.json_to_sheet(linhasDiarias);
  wsDiario["!cols"] = [
    { wch: 13 },
    { wch: 22 },
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 15 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDiario, "Detalhamento_Diario");

  const sufixoArquivo =
    lojaRef === "TODAS" ? "todas-as-lojas" : slugTextoArquivo(lojaRef);
  XLSX.writeFile(wb, `comissao-entregas-${sufixoArquivo}-${mesRef}.xlsx`);

  abrirModalEmailRelatorio();
}

function abrirModalEmailRelatorio() {
  atualizarPreviaRelatorioRH();
  const btn = document.getElementById("btn-copiar-email-comissao");
  if (btn) btn.textContent = "Copiar Mensagem";
  const modal = document.getElementById("modal-email-comissao");
  if (modal) modal.classList.add("ativo");
}

function fecharModalEmailComissao() {
  const modal = document.getElementById("modal-email-comissao");
  if (modal) modal.classList.remove("ativo");
}

async function copiarMensagemComissao() {
  const assunto = document.getElementById("email-comissao-assunto").value;
  const corpo = document.getElementById("email-comissao-corpo").value;
  const texto = `Assunto: ${assunto}\n\n${corpo}`;

  try {
    await navigator.clipboard.writeText(texto);
    const btn = document.getElementById("btn-copiar-email-comissao");
    btn.textContent = "✓ Copiado!";
    setTimeout(() => {
      btn.textContent = "Copiar Mensagem";
    }, 2000);
  } catch (e) {
    document.getElementById("email-comissao-corpo").select();
    document.execCommand("copy");
  }
}

function renderizarTudo() {
  preencherOperadorLogado();
  sincronizarSeletoresEntregadores();
  renderizarTabelaEntregadores();
  renderizarHistorico();
  atualizarPreviaComissao();
  atualizarKPIs();
}

function iniciarTelaEntregas() {
  if (typeof VERSAO_PORTAL !== "undefined") {
    const badge = document.getElementById("badge-versao-portal");
    const rodape = document.getElementById("versao-sistema");
    if (badge) badge.textContent = VERSAO_PORTAL;
    if (rodape) rodape.textContent = `Versão ${VERSAO_PORTAL}`;
  }

  carregarDadosLocais();

  const hojeISO = obterDataHojeISO();
  const primeiroDiaMesISO = obterPrimeiroDiaMesISO(hojeISO);
  const campoData = document.getElementById("entrega-data");
  const filtroInicio = document.getElementById("filtro-data-inicio");
  const filtroFim = document.getElementById("filtro-data-fim");
  const pdfInicio = document.getElementById("pdf-data-inicio");
  const pdfFim = document.getElementById("pdf-data-fim");
  const campoMesRH = document.getElementById("relatorio-mes");

  if (campoData) campoData.value = hojeISO;
  if (filtroInicio) filtroInicio.value = primeiroDiaMesISO;
  if (filtroFim) filtroFim.value = hojeISO;
  if (pdfInicio) pdfInicio.value = primeiroDiaMesISO;
  if (pdfFim) pdfFim.value = hojeISO;
  if (campoMesRH) campoMesRH.value = hojeISO.slice(0, 7);

  preencherOperadorLogado();
  renderizarTudo();
  sincronizarComBanco(false);
}

document.addEventListener("click", (e) => {
  const boxLanc = document.getElementById("box-seletor-lancamento");
  if (boxLanc && !boxLanc.contains(e.target)) {
    fecharListaLancamento();
  }

  const boxPdf = document.getElementById("box-seletor-pdf");
  if (boxPdf && !boxPdf.contains(e.target)) {
    fecharListaPDF();
  }

  const boxEditLanc = document.getElementById("box-seletor-edicao-lanc");
  if (boxEditLanc && !boxEditLanc.contains(e.target)) {
    fecharListaEdicaoLanc();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    fecharListaLancamento();
    fecharListaPDF();
    fecharListaEdicaoLanc();
    fecharModalEditarLancamento();
    fecharModalEntregador();
    fecharModalEmailComissao();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarTelaEntregas);
} else {
  iniciarTelaEntregas();
}