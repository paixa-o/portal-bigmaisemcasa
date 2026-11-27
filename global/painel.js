let cacheSolicitacoes = [];
let limiteExibicaoTabela = 10;
const TAMANHO_LOTE_TABELA = 10;
let protocoloEmConferencia = null;
let itensEmConferencia = [];
let compraInteiraEmConferencia = false;
let protocoloEmCancelamento = null;
let ultimoCodigoConferencia = "";

// Variáveis para Edição de DEV/TRC
let protocoloEmEdicao = null;
let itensEmEdicao = [];
let ultimoCodigoEdicao = "";

// Variáveis para Edição de EST
let protocoloEstornoEmEdicao = null;
let devAnteriorEdicaoEstorno = "";

// Prioridade de exibição dos status na tabela (usada após a data de solicitação)
const PRIORIDADE_STATUS_TABELA = {
  "Em andamento": 1,
  "Aguardando Financeiro": 2,
  "Concluída": 3,
  "Cancelada": 4,
};

function parseDataSolicitacao(dataStr) {
  if (!dataStr) return 0;
  const texto = String(dataStr).trim();

  // Suporta formatos como "25/11/2026 às 15:38", "25/11/2026 15:38:00" ou "25/11/2026"
  const matchData = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!matchData) {
    const timestampDireto = Date.parse(texto);
    return Number.isNaN(timestampDireto) ? 0 : timestampDireto;
  }

  const dia = parseInt(matchData[1], 10);
  const mes = parseInt(matchData[2], 10) - 1;
  const ano = parseInt(matchData[3], 10);

  const restoTexto = texto.slice(matchData.index + matchData[0].length);
  const matchHora = restoTexto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  const hora = matchHora ? parseInt(matchHora[1], 10) : 0;
  const minuto = matchHora ? parseInt(matchHora[2], 10) : 0;
  const segundo = matchHora && matchHora[3] ? parseInt(matchHora[3], 10) : 0;

  return new Date(ano, mes, dia, hora, minuto, segundo).getTime() || 0;
}

function extrairNumeroSequencial(sol) {
  const origem = sol.id || sol.protocolo || "";
  const trechoFinal = String(origem).split("-").pop();
  return parseInt(String(trechoFinal || "").replace(/\D/g, ""), 10) || 0;
}

function ordenarSolicitacoesTabela(lista) {
  return [...lista].sort((a, b) => {
    // 1º critério: Data/hora de envio/solicitação (mais recente primeiro)
    const diffData =
      parseDataSolicitacao(b.dataSolicitacao) -
      parseDataSolicitacao(a.dataSolicitacao);
    if (diffData !== 0) return diffData;

    // 2º critério: Status
    const pesoA = PRIORIDADE_STATUS_TABELA[a.status] ?? 99;
    const pesoB = PRIORIDADE_STATUS_TABELA[b.status] ?? 99;
    if (pesoA !== pesoB) return pesoA - pesoB;

    // Desempate final: número sequencial do protocolo
    return extrairNumeroSequencial(b) - extrairNumeroSequencial(a);
  });
}

function verMaisSolicitacoes() {
  limiteExibicaoTabela += TAMANHO_LOTE_TABELA;
  renderizarTabela(false);
}

// Preenche selo e rodapé com a versão atual do config.js
const badgeVersao = document.getElementById("badge-versao-portal");
if (badgeVersao && typeof VERSAO_PORTAL !== "undefined") {
  badgeVersao.textContent = VERSAO_PORTAL;
}
const elVersaoRodape = document.getElementById("versao-sistema");
if (elVersaoRodape && typeof VERSAO_PORTAL !== "undefined") {
  elVersaoRodape.textContent = `Versão ${VERSAO_PORTAL}`;
}

// Fecha qualquer menu de três pontinhos aberto ao clicar fora, rolar ou redimensionar
let bloqueioScrollDropdownAte = 0;

document.addEventListener("click", (event) => {
  if (
    !event.target.closest(".menu-tres-pontinhos-wrapper") &&
    !event.target.closest(".dropdown-acoes")
  ) {
    fecharTodosMenusDropdown();
  }
});

window.addEventListener(
  "scroll",
  () => {
    if (Date.now() < bloqueioScrollDropdownAte) return;
    fecharTodosMenusDropdown();
  },
  true
);

window.addEventListener("resize", fecharTodosMenusDropdown);

function fecharTodosMenusDropdown() {
  document.querySelectorAll(".dropdown-acoes.aberto").forEach((menu) => {
    menu.classList.remove("aberto");
    menu.style.display = "none";
  });
}

function alternarMenuDropdown(event, protocolo) {
  event.stopPropagation();
  const botao = event.currentTarget;
  const menuAlvo = document.getElementById(`dropdown-${protocolo}`);
  const estavaAberto = menuAlvo && menuAlvo.classList.contains("aberto");

  fecharTodosMenusDropdown();

  if (menuAlvo && !estavaAberto) {
    bloqueioScrollDropdownAte = Date.now() + 180;
    menuAlvo.style.display = "block";
    menuAlvo.classList.add("aberto");

    const rectBotao = botao.getBoundingClientRect();
    const rectMenu = menuAlvo.getBoundingClientRect();

    const larguraMenu = rectMenu.width || 225;
    const alturaMenu = rectMenu.height || 220;

    let left = rectBotao.right - larguraMenu;
    if (left < 10) left = 10;
    if (left + larguraMenu > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - larguraMenu - 10);
    }

    let top = rectBotao.bottom + 4;
    if (top + alturaMenu > window.innerHeight - 10) {
      top = Math.max(10, rectBotao.top - alturaMenu - 4);
    }

    menuAlvo.style.left = `${Math.round(left)}px`;
    menuAlvo.style.top = `${Math.round(top)}px`;
  }
}

/**
 * Retorna o Estorno ativo (não cancelado) vinculado a uma DEV.
 * Se o EST estiver Cancelado, retorna undefined (liberando a DEV).
 */
function obterEstornoVinculado(protocoloDev, ignorarProtocoloEst = "") {
  return cacheSolicitacoes.find(
    (s) =>
      s.tipo === "EST" &&
      s.protocolo !== ignorarProtocoloEst &&
      s.protocoloDevolucao === protocoloDev &&
      s.status !== "Cancelada"
  );
}

function atualizarKPIs(lista) {
  const total = lista.length;
  const emAndamento = lista.filter(
    (s) => s.status === "Em andamento" || s.status === "Aguardando Financeiro"
  ).length;
  const concluidas = lista.filter((s) => s.status === "Concluída").length;
  const canceladas = lista.filter((s) => s.status === "Cancelada").length;

  document.getElementById("kpi-total").textContent = total;
  document.getElementById("kpi-andamento").textContent = emAndamento;
  document.getElementById("kpi-concluida").textContent = concluidas;
  document.getElementById("kpi-cancelada").textContent = canceladas;
}

async function carregarSolicitacoesDaPlanilha() {
  const corpoTabela = document.getElementById("corpo-tabela-solicitacoes");
  if (!corpoTabela) return;

  limiteExibicaoTabela = TAMANHO_LOTE_TABELA;

  if (
    typeof URL_API_PLANILHA === "undefined" ||
    !URL_API_PLANILHA.startsWith("http")
  ) {
    corpoTabela.innerHTML =
      '<tr><td colspan="9" style="text-align:center; padding:25px; color:#d32f2f;">Configure a URL da Planilha Google no arquivo <strong>global/config.js</strong>.</td></tr>';
    return;
  }

  corpoTabela.innerHTML =
    '<tr><td colspan="9" style="text-align:center; padding:25px; color:#64748b;">Sincronizando solicitações com a Planilha Google...</td></tr>';

  try {
    const separador = URL_API_PLANILHA.includes("?") ? "&" : "?";
    const resposta = await fetch(`${URL_API_PLANILHA}${separador}t=${Date.now()}`);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status} (${resposta.statusText})`);
    }

    const texto = await resposta.text();
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (e) {
      throw new Error(
        "Resposta não é JSON válido. Verifique se a URL em global/config.js está correta e publicada como 'Qualquer pessoa'."
      );
    }

    if (dados.sucesso) {
      cacheSolicitacoes = Array.isArray(dados.solicitacoes)
        ? dados.solicitacoes
        : [];
      renderizarTabela(true);
    } else {
      throw new Error(dados.erro || "Erro desconhecido retornado pela planilha.");
    }
  } catch (erro) {
    console.error("Erro detalhado ao carregar planilha:", erro);
    const msgSegura = String(erro.message || erro)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");
    corpoTabela.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:25px; color:#dc2626;">
      <strong>Não foi possível conectar à Planilha Google.</strong><br>
      <small style="color:#475569;">Motivo técnico: ${msgSegura}</small>
    </td></tr>`;
  }
}

function renderizarTabela(resetarLimite = true) {
  if (resetarLimite) {
    limiteExibicaoTabela = TAMANHO_LOTE_TABELA;
  }

  const termoBusca = document
    .getElementById("filtro-busca")
    .value.trim()
    .toLowerCase();
  const termoSemHifen = termoBusca.replace(/[-\s]/g, "");
  const termoLimpoNumeros = termoBusca.replace(/\D/g, "");

  const filtroLoja = document.getElementById("filtro-loja").value;
  const filtroTipo = document.getElementById("filtro-tipo").value;
  const filtroStatus = document.getElementById("filtro-status").value;

  const listaValida = cacheSolicitacoes.filter(
    (item) => item && typeof item === "object" && item.protocolo
  );

  const listaPorLoja =
    filtroLoja === "TODOS"
      ? listaValida
      : listaValida.filter((item) => String(item.loja || "") === filtroLoja);
  atualizarKPIs(listaPorLoja);

  const filtradas = listaValida.filter((item) => {
    const lojaStr = String(item.loja || "");
    const tipoStr = String(item.tipo || "");
    const statusStr = String(item.status || "");

    const bateLoja = filtroLoja === "TODOS" || lojaStr === filtroLoja;
    const bateTipo = filtroTipo === "TODOS" || tipoStr === filtroTipo;
    const bateStatus = filtroStatus === "TODOS" || statusStr === filtroStatus;

    const protocoloStr = String(item.protocolo || "");
    const protocoloLower = protocoloStr.toLowerCase();
    const protocoloSemHifen = protocoloLower.replace(/[-\s]/g, "");
    const protocoloApenasNumeros = protocoloStr.replace(/\D/g, "");

    const pedidoStr = String(item.numeroPedido || "");
    const clienteObj = item.cliente || {};
    const nomeClienteStr = String(clienteObj.nome || "");
    const cpfClienteStr = String(clienteObj.cpf || "");
    const telClienteStr = String(clienteObj.telefone || "");

    const cpfLimpo = cpfClienteStr.replace(/\D/g, "");
    const telefoneLimpo = telClienteStr.replace(/\D/g, "");

    const bateBusca =
      termoBusca === "" ||
      protocoloLower.includes(termoBusca) ||
      (termoSemHifen !== "" && protocoloSemHifen.includes(termoSemHifen)) ||
      (termoLimpoNumeros !== "" &&
        protocoloApenasNumeros.includes(termoLimpoNumeros)) ||
      pedidoStr.toLowerCase().includes(termoBusca.replace(/^#+/, "")) ||
      nomeClienteStr.toLowerCase().includes(termoBusca) ||
      cpfClienteStr.includes(termoBusca) ||
      (termoLimpoNumeros !== "" &&
        (cpfLimpo.includes(termoLimpoNumeros) ||
          telefoneLimpo.includes(termoLimpoNumeros)));

    return bateLoja && bateTipo && bateStatus && bateBusca;
  });

  const tbody = document.getElementById("corpo-tabela-solicitacoes");
  const barraPaginacao = document.getElementById("barra-paginacao-tabela");
  const infoPaginacao = document.getElementById("info-paginacao-tabela");
  const btnVerMais = document.getElementById("btn-ver-mais-solicitacoes");

  if (filtradas.length === 0) {
    if (barraPaginacao) barraPaginacao.style.display = "none";
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 30px; color: #777;">
          Nenhuma solicitação encontrada para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  const ordenadas = ordenarSolicitacoesTabela(filtradas);
  const itensVisiveis = ordenadas.slice(0, limiteExibicaoTabela);

  if (barraPaginacao && infoPaginacao && btnVerMais) {
    barraPaginacao.style.display = "flex";
    infoPaginacao.textContent = `Exibindo ${itensVisiveis.length} de ${ordenadas.length} solicitação(ões)`;
    btnVerMais.style.display =
      itensVisiveis.length < ordenadas.length ? "inline-block" : "none";
  }

  tbody.innerHTML = "";

  itensVisiveis.forEach((sol) => {
    const isEstorno = sol.tipo === "EST";
    const isDevolucao = sol.tipo === "DEV";
    const isEmAberto =
      sol.status === "Em andamento" || sol.status === "Aguardando Financeiro";

    const clienteSeg = sol.cliente || { nome: "-", cpf: "", telefone: "" };

    const estornoVinculado = isDevolucao
      ? obterEstornoVinculado(sol.protocolo)
      : null;

    // Bloqueio total da DEV enquanto estiver conectada a um EST não cancelado
    const devBloqueadaPorEstorno = Boolean(estornoVinculado);

    const classeBadgeStatus =
      sol.status === "Concluída"
        ? "badge-concluida"
        : sol.status === "Cancelada"
          ? "badge-cancelada"
          : sol.status === "Aguardando Financeiro"
            ? "badge-aguardando-fin"
            : "badge-andamento";

    const classeBadgeTipo =
      sol.tipo === "DEV"
        ? "badge-tipo-dev"
        : sol.tipo === "TRC"
          ? "badge-tipo-trc"
          : "badge-tipo-est";

    const qtdItens = Array.isArray(sol.produtos) ? sol.produtos.length : 0;
    const textoColunaItens = isEstorno
      ? `<strong style="color: #0369a1;">${sol.valorDevolvido || sol.valorEstorno || "-"}</strong>`
      : sol.compraInteira && qtdItens === 0
        ? `<span class="badge-compra-inteira">Compra Inteira</span>`
        : `${qtdItens} ${qtdItens === 1 ? "item" : "itens"}`;

    const isConcluida = sol.status === "Concluída";
    const textoWppMenu = isConcluida
      ? "WhatsApp Conclusão"
      : sol.whatsappEnviado
        ? "WhatsApp (Enviado ✓)"
        : "Enviar WhatsApp";
    const classeWppMenu = isConcluida
      ? "item-wpp"
      : sol.whatsappEnviado
        ? "item-wpp-enviado"
        : "item-wpp";

    const mostrarBotaoCanhoto = sol.tipo === "DEV" || sol.tipo === "TRC";

    const podeEditarDevTrc =
      !isEstorno && sol.status === "Em andamento" && !devBloqueadaPorEstorno;
    const podeEditarEstorno = isEstorno && isEmAberto;

    tbody.innerHTML += `
      <tr>
        <td>
          <strong>${sol.protocolo}</strong>
          ${sol.entregueEmLoja ? `<br><span class="badge-loja-entrega">ENTREGA EM LOJA</span>` : ""}
          ${sol.protocoloDevolucao ? `<br><small style="color: #0369a1; font-weight: 600;">Ref: ${sol.protocoloDevolucao}</small>` : ""}
          ${estornoVinculado ? `<br><span class="badge-vinculada-est" title="DEV bloqueada enquanto vinculada a este estorno">ESTORNO: ${estornoVinculado.protocolo}</span>` : ""}
        </td>
        <td><small style="font-weight: 600; color: #334155;">${sol.loja || "-"}</small></td>
        <td><span class="badge ${classeBadgeTipo}">${sol.tipo}</span></td>
        <td>${sol.dataSolicitacao || "-"}</td>
        <td>
          ${clienteSeg.nome || "-"}<br>
          <small style="color: #666;">${clienteSeg.telefone || ""}</small>
        </td>
        <td>#${String(sol.numeroPedido || "").replace(/^#+/, "")}</td>
        <td>${textoColunaItens}</td>
        <td><span class="badge ${classeBadgeStatus}">${sol.status || "Em andamento"}</span></td>
        <td>
          <div class="acoes-linha">
            ${
              mostrarBotaoCanhoto
                ? `<button type="button" class="btn-acao-tabela btn-canhoto" onclick="imprimirCanhotoColeta('${sol.protocolo}')" title="Imprimir comprovante em 2 vias (A4 Retrato)">
                    Canhoto
                  </button>`
                : ""
            }
            ${
              isEstorno
                ? `<button type="button" class="btn-acao-tabela btn-email-fin" onclick="abrirModalEmailEstorno('${sol.protocolo}')" title="Copiar e-mail para o financeiro">
                    E-mail Fin.
                  </button>`
                : ""
            }

            <div class="menu-tres-pontinhos-wrapper">
              <button
                type="button"
                class="btn-tres-pontinhos"
                onclick="alternarMenuDropdown(event, '${sol.protocolo}')"
                title="Mais ações"
              >
                ⋮
              </button>
              <div class="dropdown-acoes" id="dropdown-${sol.protocolo}">
                <button type="button" class="dropdown-item" onclick="fecharTodosMenusDropdown(); verDetalhes('${sol.protocolo}')">
                  Ver Detalhes
                </button>
                ${
                  podeEditarDevTrc
                    ? `<button type="button" class="dropdown-item" onclick="fecharTodosMenusDropdown(); abrirModalEdicao('${sol.protocolo}')">
                        Editar Solicitação
                      </button>`
                    : ""
                }
                ${
                  podeEditarEstorno
                    ? `<button type="button" class="dropdown-item" onclick="fecharTodosMenusDropdown(); abrirModalEdicaoEstorno('${sol.protocolo}')">
                        Editar Estorno
                      </button>`
                    : ""
                }
                <button type="button" class="dropdown-item ${classeWppMenu}" onclick="fecharTodosMenusDropdown(); enviarWhatsApp('${sol.protocolo}')">
                  ${textoWppMenu}
                </button>

                ${
                  devBloqueadaPorEstorno
                    ? `<div class="dropdown-divisor"></div>
                       <div style="padding: 8px 14px; font-size: 11.5px; color: #c2410c; background: #fff7ed; line-height: 1.35;">
                         🔒 Bloqueada (vinculada ao estorno <strong>${estornoVinculado.protocolo}</strong>). Cancele o estorno para liberar alterações.
                       </div>`
                    : `
                      <div class="dropdown-divisor"></div>
                      ${
                        isEstorno && sol.status === "Em andamento"
                          ? `<button type="button" class="dropdown-item" style="color: #0284c7;" onclick="fecharTodosMenusDropdown(); atualizarStatusSimples('${sol.protocolo}', 'Aguardando Financeiro')">
                              Marcar Aguard. Financeiro
                            </button>`
                          : ""
                      }
                      ${
                        isEmAberto
                          ? isEstorno
                            ? `<button type="button" class="dropdown-item item-concluir" onclick="fecharTodosMenusDropdown(); atualizarStatusSimples('${sol.protocolo}', 'Concluída')">
                                Concluir Estorno
                              </button>`
                            : `<button type="button" class="dropdown-item item-concluir" onclick="fecharTodosMenusDropdown(); abrirModalConferencia('${sol.protocolo}')">
                                Concluir (Conferir)
                              </button>`
                          : ""
                      }
                      ${
                        isEmAberto
                          ? `<button type="button" class="dropdown-item item-cancelar" onclick="fecharTodosMenusDropdown(); abrirModalCancelamento('${sol.protocolo}')">
                              Cancelar Solicitação
                            </button>`
                          : `<button type="button" class="dropdown-item" onclick="fecharTodosMenusDropdown(); reabrirSolicitacao('${sol.protocolo}')">
                              Reabrir Solicitação
                            </button>`
                      }
                      ${
                        isDevolucao && sol.status === "Concluída" && !estornoVinculado
                          ? `<div class="dropdown-divisor"></div>
                             <button type="button" class="dropdown-item" style="color: #0284c7;" onclick="window.location.href='estorno/index.html?dev=${sol.protocolo}'">
                               Solicitar Estorno (EST) →
                             </button>`
                          : ""
                      }
                    `
                }
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  });
}

// =========================================================================
// E-MAIL FINANCEIRO E STATUS SIMPLES (ESTORNO)
// =========================================================================

function abrirModalEmailEstorno(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  const isNaoPago = Boolean(sol.pedidoNaoPago);
  const valorEstornar = isNaoPago
    ? "R$ 0,00 (Não pago)"
    : sol.valorDevolvido || sol.valorEstorno || "R$ 0,00";
  const valorPedidoExibido = isNaoPago
    ? "R$ 0,00 (Não pago)"
    : sol.valorPedido || "Não informado";

  const assunto = isNaoPago
    ? `Cancelamento / Baixa Fiscal (Pedido Não Pago) - Pedido #${sol.numeroPedido}${sol.sequenciaCliente ? ` | SEQ ${sol.sequenciaCliente}` : ""}`
    : `Solicitação de Estorno - Pedido #${sol.numeroPedido}${sol.sequenciaCliente ? ` | SEQ ${sol.sequenciaCliente}` : ""}`;

  const linhaDev = sol.protocoloDevolucao
    ? `• Protocolo de Devolução: ${sol.protocoloDevolucao} (uso interno do setor)\n`
    : "";

  const blocoFinanceiro = isNaoPago
    ? `- Situação do Pagamento: PEDIDO NÃO PAGO (Compra cancelada antes do pagamento — sem estorno financeiro)\n- Valor do Pedido: ${valorPedidoExibido}\n- Valor Devolvido (a Estornar): ${valorEstornar}\n- Forma de Pagamento: ${sol.formaPagamento || "Não pago (Compra cancelada)"}`
    : `- Valor do Pedido: ${valorPedidoExibido}\n- Valor Devolvido (a Estornar): ${valorEstornar}\n- Forma de Pagamento: ${sol.formaPagamento || "Não informada"}`;

  const corpo = `Olá,

Segue ${isNaoPago ? "registro de cancelamento de pedido não pago" : "solicitação de estorno"} cliente E-Commerce (Bigmais em Casa):

- Data de Solicitação: ${sol.dataSolicitacao}
- Loja: ${sol.loja || "Não informada"}
- Solicitante: ${sol.solicitante}

CONTROLE INTERNO DO SETOR E-COMMERCE (USO EXCLUSIVO DO SETOR — NÃO É CÓDIGO DO FINANCEIRO):

- Protocolo de Estorno: ${sol.protocolo} (uso interno do setor)
${linhaDev}
DADOS DO CLIENTE:

- Nome do Cliente: ${sol.cliente.nome}
- CPF do Cliente: ${sol.cliente.cpf}
- Sequência Cliente (SEQ): ${sol.sequenciaCliente || "Não informada"}
- Telefone (WhatsApp): ${sol.cliente.telefone}

DADOS FISCAIS E FINANCEIROS:

- Número do Pedido: #${sol.numeroPedido}
- Nota Fiscal do Pedido (Nº): ${sol.nfPedido || "Não informada"}
- Nota Fiscal da Devolução: ${sol.nfDevolucao || "Não informada"}
${blocoFinanceiro}

MOTIVO DA SOLICITAÇÃO:

- Motivo: ${sol.motivo || "Não especificado"}
- Detalhes / Observação: ${sol.observacao || "Sem observações adicionais."}

Qualquer dúvida estamos à disposição.

Atenciosamente, Equipe E-commerce Bigmais em Casa.`;

  document.getElementById("painel-email-assunto").value = assunto;
  document.getElementById("painel-email-corpo").value = corpo;
  document.getElementById("btn-copiar-email-painel").textContent =
    "Copiar Assunto e E-mail";
  document.getElementById("modal-email-estorno").showModal();
}

async function copiarEmailPainel() {
  const assunto = document.getElementById("painel-email-assunto").value;
  const corpo = document.getElementById("painel-email-corpo").value;
  try {
    await navigator.clipboard.writeText(`Assunto: ${assunto}\n\n${corpo}`);
    const btn = document.getElementById("btn-copiar-email-painel");
    btn.textContent = "✓ Copiado!";
    setTimeout(() => {
      btn.textContent = "Copiar Assunto e E-mail";
    }, 2500);
  } catch (e) {
    document.getElementById("painel-email-corpo").select();
    document.execCommand("copy");
  }
}

async function atualizarStatusSimples(protocolo, novoStatus) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (sol && sol.tipo === "DEV" && obterEstornoVinculado(sol.protocolo)) {
    alert(
      "Esta devolução está vinculada a um estorno ativo e não pode ter o status alterado."
    );
    return;
  }

  const confirmar = confirm(
    `Alterar o status da solicitação ${protocolo} para "${novoStatus}"?`
  );
  if (!confirmar) return;

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "atualizarStatus",
        protocolo: protocolo,
        novoStatus: novoStatus,
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocolo
      );
      if (indice !== -1) {
        cacheSolicitacoes[indice].status = novoStatus;
      }
      renderizarTabela(false);
    } else {
      alert("Erro ao atualizar status: " + resultado.erro);
    }
  } catch (e) {
    alert("Falha de conexão ao atualizar status.");
  }
}

// =========================================================================
// EDIÇÃO DE ESTORNO (EST NÃO FINALIZADO) — COM TROCA DE DEV VINCULADA
// =========================================================================

function mascaraMoedaPainel(input) {
  let numeros = input.value.replace(/\D/g, "");
  if (numeros === "") {
    input.value = "";
    return;
  }
  const valorFloat = parseInt(numeros, 10) / 100;
  input.value = valorFloat.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function converterMoedaPainelParaFloat(textoMoeda) {
  if (!textoMoeda) return 0;
  return (
    parseFloat(textoMoeda.replace(/[R$\s.]/g, "").replace(",", ".")) || 0
  );
}

function popularSelectDevEdicaoEstorno(protocoloEstornoAtual, protocoloDevAtual) {
  const select = document.getElementById("edit-est-dev-select");
  select.innerHTML = `<option value="">-- Selecione a DEV concluída --</option>`;

  const devsDisponiveis = cacheSolicitacoes.filter((s) => {
    if (s.tipo !== "DEV") return false;
    if (s.protocolo === protocoloDevAtual) return true;
    if (s.status !== "Concluída") return false;
    const estAtivo = obterEstornoVinculado(s.protocolo, protocoloEstornoAtual);
    return !estAtivo;
  });

  devsDisponiveis
    .slice()
    .reverse()
    .forEach((dev) => {
      const opt = document.createElement("option");
      opt.value = dev.protocolo;
      opt.textContent = `${dev.protocolo} — Pedido #${dev.numeroPedido} (${dev.cliente.nome})`;
      select.appendChild(opt);
    });

  select.value = protocoloDevAtual || "";
}

function aoTrocarDevNaEdicaoEstorno() {
  const select = document.getElementById("edit-est-dev-select");
  const novaDevProto = select.value;

  if (novaDevProto === devAnteriorEdicaoEstorno) return;

  document.getElementById("edit-est-loja").value = "Loja 8 - Vila Isa";
  document.getElementById("edit-est-nome").value = "";
  document.getElementById("edit-est-cpf").value = "";
  document.getElementById("edit-est-seq").value = "";
  document.getElementById("edit-est-telefone").value = "";
  document.getElementById("edit-est-pedido").value = "";
  document.getElementById("edit-est-nf-pedido").value = "";
  document.getElementById("edit-est-nf-dev").value = "";
  document.getElementById("edit-est-valor-pedido").value = "";
  document.getElementById("edit-est-valor-devolvido").value = "";
  document.getElementById("edit-est-pagamento").value = "Crédito";
  document.getElementById("edit-est-motivo").value = "";
  document.getElementById("edit-est-observacao").value = "";

  devAnteriorEdicaoEstorno = novaDevProto;

  if (!novaDevProto) return;

  const dev = cacheSolicitacoes.find((s) => s.protocolo === novaDevProto);
  if (!dev) return;

  if (dev.loja) document.getElementById("edit-est-loja").value = dev.loja;
  document.getElementById("edit-est-nome").value = dev.cliente?.nome || "";
  document.getElementById("edit-est-cpf").value = dev.cliente?.cpf || "";
  document.getElementById("edit-est-telefone").value =
    dev.cliente?.telefone || "";
  document.getElementById("edit-est-pedido").value = dev.numeroPedido || "";
  document.getElementById("edit-est-motivo").value =
    dev.compraInteira && (!dev.produtos || dev.produtos.length === 0)
      ? "Devolução da compra inteira"
      : dev.motivo || "";

  const resumoItens =
    dev.compraInteira && (!dev.produtos || dev.produtos.length === 0)
      ? "Devolução da compra inteira."
      : (dev.produtos || [])
          .map((p) => `${p.quantidade}${p.unidade} x ${p.descricao}`)
          .join(", ");

  if (resumoItens) {
    document.getElementById("edit-est-observacao").value =
      `Itens devolvidos: ${resumoItens}`;
  }
}

function abrirModalEdicaoEstorno(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  if (sol.status === "Concluída" || sol.status === "Cancelada") {
    alert(
      "Solicitações de estorno concluídas ou canceladas não podem ser editadas."
    );
    return;
  }

  protocoloEstornoEmEdicao = protocolo;
  devAnteriorEdicaoEstorno = sol.protocoloDevolucao || "";

  document.getElementById("edit-est-titulo").textContent =
    `Editar Solicitação de Estorno - ${sol.protocolo}`;

  popularSelectDevEdicaoEstorno(sol.protocolo, sol.protocoloDevolucao || "");

  document.getElementById("edit-est-loja").value =
    sol.loja || "Loja 8 - Vila Isa";
  document.getElementById("edit-est-solicitante").value = sol.solicitante || "";

  document.getElementById("edit-est-nome").value = sol.cliente?.nome || "";
  document.getElementById("edit-est-cpf").value = sol.cliente?.cpf || "";
  document.getElementById("edit-est-seq").value = sol.sequenciaCliente || "";
  document.getElementById("edit-est-telefone").value =
    sol.cliente?.telefone || "";

  document.getElementById("edit-est-pedido").value = sol.numeroPedido || "";
  document.getElementById("edit-est-nf-pedido").value = sol.nfPedido || "";
  document.getElementById("edit-est-nf-dev").value = sol.nfDevolucao || "";
  document.getElementById("edit-est-valor-pedido").value =
    sol.valorPedido || "";
  document.getElementById("edit-est-valor-devolvido").value =
    sol.valorDevolvido || sol.valorEstorno || "";

  const selectPag = document.getElementById("edit-est-pagamento");
  const opcoesPag = Array.from(selectPag.options).map((o) => o.value);
  selectPag.value = opcoesPag.includes(sol.formaPagamento)
    ? sol.formaPagamento
    : "Crédito";

  document.getElementById("edit-est-motivo").value = sol.motivo || "";
  document.getElementById("edit-est-observacao").value = sol.observacao || "";

  document.getElementById("modal-edicao-estorno").showModal();
}

async function salvarEdicaoEstorno() {
  const protocoloDevolucao = document
    .getElementById("edit-est-dev-select")
    .value.trim();

  if (!protocoloDevolucao) {
    alert("Selecione obrigatoriamente uma Devolução Concluída (DEV).");
    document.getElementById("edit-est-dev-select").focus();
    return;
  }

  const conflitoEst = obterEstornoVinculado(
    protocoloDevolucao,
    protocoloEstornoEmEdicao
  );
  if (conflitoEst) {
    alert(
      `A devolução ${protocoloDevolucao} já está vinculada ao estorno ${conflitoEst.protocolo}. Selecione outra DEV livre.`
    );
    return;
  }

  const loja = document.getElementById("edit-est-loja").value;
  const solicitante = document
    .getElementById("edit-est-solicitante")
    .value.trim();
  const nome = document.getElementById("edit-est-nome").value.trim();
  const cpf = document.getElementById("edit-est-cpf").value.trim();
  const sequenciaCliente = document
    .getElementById("edit-est-seq")
    .value.trim();
  const telefone = document.getElementById("edit-est-telefone").value.trim();

  const numeroPedido = document
    .getElementById("edit-est-pedido")
    .value.trim()
    .replace(/^#+/, "");
  const nfPedido = document.getElementById("edit-est-nf-pedido").value.trim();
  const nfDevolucao = document.getElementById("edit-est-nf-dev").value.trim();
  const valorPedido = document
    .getElementById("edit-est-valor-pedido")
    .value.trim();
  const valorDevolvido = document
    .getElementById("edit-est-valor-devolvido")
    .value.trim();
  const formaPagamento = document.getElementById("edit-est-pagamento").value;
  const motivo = document.getElementById("edit-est-motivo").value.trim();
  const observacao = document
    .getElementById("edit-est-observacao")
    .value.trim();

  if (
    !solicitante ||
    !nome ||
    !cpf ||
    !sequenciaCliente ||
    !telefone ||
    !numeroPedido ||
    !nfPedido ||
    !nfDevolucao ||
    !valorPedido ||
    !valorDevolvido ||
    !motivo
  ) {
    alert(
      "Preencha todos os campos obrigatórios (incluindo Nota Fiscal da Devolução) antes de salvar."
    );
    return;
  }

  const numPedido = converterMoedaPainelParaFloat(valorPedido);
  const numDevolvido = converterMoedaPainelParaFloat(valorDevolvido);

  if (numPedido <= 0 || numDevolvido <= 0) {
    alert("Informe valores monetários válidos maiores que R$ 0,00.");
    return;
  }

  if (numDevolvido > numPedido) {
    alert("O Valor Devolvido não pode ser maior que o Valor do Pedido.");
    return;
  }

  const botao = document.getElementById("btn-salvar-edicao-estorno");
  botao.disabled = true;
  botao.textContent = "Salvando Alterações...";

  const dadosEditados = {
    tipo: "EST",
    loja,
    solicitante,
    protocoloDevolucao,
    numeroPedido,
    sequenciaCliente,
    nfPedido,
    nfDevolucao,
    valorPedido,
    valorDevolvido,
    valorEstorno: valorDevolvido,
    formaPagamento,
    motivo,
    observacao,
    cliente: { nome, cpf, telefone },
    endereco: {
      rua: `VINCULADO À DEVOLUÇÃO ${protocoloDevolucao}`,
      cep: "",
      numero: "",
      bairro: "",
      cidade: "",
      estado: "",
      complemento: "",
    },
  };

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "editar",
        protocoloOriginal: protocoloEstornoEmEdicao,
        dados: dadosEditados,
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocoloEstornoEmEdicao
      );
      if (indice !== -1) {
        cacheSolicitacoes[indice] = resultado.dadosAtualizados;
      }

      document.getElementById("modal-edicao-estorno").close();
      renderizarTabela(false);
      alert(
        `Estorno ${resultado.dadosAtualizados.protocolo} atualizado com sucesso!`
      );
    } else {
      alert("Erro ao editar estorno na planilha: " + resultado.erro);
    }
  } catch (erro) {
    alert("Falha de conexão ao tentar salvar as alterações do estorno.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar Alterações";
  }
}

// =========================================================================
// IMPRESSÃO DO CANHOTO / COMPROVANTE EM 2 VIAS (A4 RETRATO)
// =========================================================================

function montarHTMLViaCanhoto(sol, rotuloVia, tituloDocumento, termoRodape, classeExtra) {
  const temItensIndividuais = sol.produtos && sol.produtos.length > 0;
  const isCompraInteira = Boolean(sol.compraInteira) && !temItensIndividuais;
  const isTroca = sol.tipo === "TRC";

  let conteudoProdutosHTML = "";

  if (isCompraInteira) {
    const tipoOperacaoTexto = isTroca ? "TROCA TOTAL" : "DEVOLUÇÃO TOTAL";
    conteudoProdutosHTML = `
      <div class="canhoto-box-compra-inteira">
        <div class="canhoto-compra-inteira-titulo">
          ☑ ${tipoOperacaoTexto} — COMPRA INTEIRA (PEDIDO #${sol.numeroPedido})
        </div>
        <div class="canhoto-compra-inteira-desc">
          Refere-se à devolução/troca integral de todos os itens constantes no pedido <strong>#${sol.numeroPedido}</strong>, dispensando a discriminação item a item. Conferir volumes e itens conforme cupom/nota do pedido.
        </div>
      </div>
    `;
  } else {
    const linhasItensHTML = (sol.produtos || [])
      .map((item) => {
        const unidadeTexto = item.unidade === "Un" ? "" : ` ${item.unidade}`;
        return `
          <tr>
            <td style="text-align: center; width: 26px; font-size: 13px;">☐</td>
            <td style="width: 62px;">${item.sku || "-"}</td>
            <td style="width: 98px;">${item.ean || "-"}</td>
            <td style="font-weight: 700;">${item.descricao}</td>
            <td style="text-align: center; width: 72px; font-weight: 800;">${item.quantidade}${unidadeTexto}</td>
            <td style="text-align: center; width: 76px;"></td>
          </tr>
        `;
      })
      .join("");

    conteudoProdutosHTML = `
      <table class="canhoto-tabela">
        <thead>
          <tr>
            <th style="text-align: center; width: 26px;">OK</th>
            <th style="width: 62px;">SKU</th>
            <th style="width: 98px;">EAN</th>
            <th>Descrição do Produto</th>
            <th style="text-align: center; width: 72px;">Qtd. Solic.</th>
            <th style="text-align: center; width: 76px;">Qtd. Conf.</th>
          </tr>
        </thead>
        <tbody>
          ${linhasItensHTML}
        </tbody>
      </table>
    `;
  }

  const enderecoCompleto = sol.entregueEmLoja
    ? "ENTREGUE EM LOJA (Cliente trouxe o produto presencialmente)"
    : `${sol.endereco.rua}, nº ${sol.endereco.numero}${
        sol.endereco.complemento ? ` (${sol.endereco.complemento})` : ""
      } — Bairro: ${sol.endereco.bairro} — ${sol.endereco.cidade}/${sol.endereco.estado} — CEP: ${sol.endereco.cep}`;

  const tituloBlocoLogistica = sol.entregueEmLoja
    ? "Modalidade de Entrega & Motivo"
    : "Endereço de Coleta & Motivo";

  const labelEndereco = sol.entregueEmLoja ? "Local:" : "Endereço:";
  const labelDataOperacao = sol.entregueEmLoja
    ? isTroca
      ? "Data/Hora da Troca:"
      : "Data/Hora da Entrega:"
    : "Data/Hora da Coleta:";

  return `
    <div class="canhoto-via ${classeExtra}">
      <div>
        <div class="canhoto-cabecalho">
          <div>
            <span class="canhoto-etiqueta-via">${rotuloVia}</span>
            <div class="canhoto-titulo">${tituloDocumento}</div>
            <div class="canhoto-subtitulo">
              <strong>Loja:</strong> ${sol.loja || "Não informada"} |
              <strong>Pedido:</strong> #${sol.numeroPedido} |
              <strong>Data:</strong> ${sol.dataSolicitacao}
            </div>
          </div>
          <div class="canhoto-box-protocolo">
            <div style="font-size: 8px; font-weight: 800; text-transform: uppercase;">Protocolo</div>
            <div style="font-size: 14px; font-weight: 900;">${sol.protocolo}</div>
          </div>
        </div>

        <div class="canhoto-grid-info">
          <div class="canhoto-bloco">
            <div class="canhoto-bloco-titulo">Dados do Cliente</div>
            <div class="canhoto-linha-cliente">
              <span><strong>Nome:</strong> ${sol.cliente.nome}</span>
              <span><strong>CPF:</strong> ${sol.cliente.cpf}</span>
              <span><strong>WhatsApp:</strong> ${sol.cliente.telefone}</span>
            </div>
          </div>

          <div class="canhoto-bloco">
            <div class="canhoto-bloco-titulo">${tituloBlocoLogistica}</div>
            <div><strong>${labelEndereco}</strong> ${enderecoCompleto}</div>
            <div style="margin-top: 2px;">
              <strong>Motivo:</strong> ${sol.motivo}${sol.observacao ? ` — <strong>Obs.:</strong> ${sol.observacao}` : ""}
            </div>
          </div>
        </div>

        ${conteudoProdutosHTML}
      </div>

      <div class="canhoto-rodape">
        <div class="canhoto-termo">
          ${termoRodape}<br>
          <strong>${labelDataOperacao}</strong> ____/____/20____ às ____:____.
        </div>
        <div class="canhoto-assinaturas">
          <div class="canhoto-linha-assinatura">Assinatura do Cliente / Responsável</div>
          <div class="canhoto-linha-assinatura">Nome Legível / Doc. (RG ou CPF)</div>
          <div class="canhoto-linha-assinatura">${sol.entregueEmLoja ? "Assinatura do Atendente / Loja" : "Assinatura do Motorista"}</div>
        </div>
      </div>
    </div>
  `;
}

function imprimirCanhotoColeta(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  const isTroca = sol.tipo === "TRC";
  const naLoja = Boolean(sol.entregueEmLoja);

  const via1HTML = isTroca
    ? montarHTMLViaCanhoto(
        sol,
        naLoja ? "1ª VIA — EMPRESA / LOJA" : "1ª VIA — EMPRESA / MOTORISTA",
        "BIGMAIS EM CASA — CANHOTO DE TROCA",
        naLoja
          ? "Declaro que os itens conferidos acima foram trocados presencialmente na unidade do Bigmais em Casa."
          : "Declaro que os itens conferidos acima foram trocados/recolhidos pelo motorista do Bigmais em Casa.",
        "canhoto-via-superior"
      )
    : montarHTMLViaCanhoto(
        sol,
        naLoja ? "1ª VIA — EMPRESA / LOJA" : "1ª VIA — EMPRESA / MOTORISTA",
        naLoja
          ? "BIGMAIS EM CASA — COMPROVANTE DE DEVOLUÇÃO EM LOJA"
          : "BIGMAIS EM CASA — CANHOTO DE RECOLHIMENTO",
        naLoja
          ? "Declaro que os itens referentes a esta solicitação foram entregues presencialmente pelo cliente na unidade do Bigmais em Casa."
          : "Declaro que os itens conferidos acima foram recolhidos/entregues para devolução ao Bigmais em Casa.",
        "canhoto-via-superior"
      );

  const via2HTML = isTroca
    ? montarHTMLViaCanhoto(
        sol,
        "2ª VIA — CLIENTE (COMPROVANTE DE TROCA)",
        "BIGMAIS EM CASA — COMPROVANTE DE TROCA",
        "Comprovante do cliente referente aos itens trocados junto ao Bigmais em Casa.",
        ""
      )
    : montarHTMLViaCanhoto(
        sol,
        "2ª VIA — CLIENTE (COMPROVANTE DE DEVOLUÇÃO)",
        naLoja
          ? "BIGMAIS EM CASA — COMPROVANTE DE DEVOLUÇÃO"
          : "BIGMAIS EM CASA — COMPROVANTE DE RECOLHIMENTO",
        naLoja
          ? "Comprovante do cliente referente aos itens entregues para devolução na unidade do Bigmais em Casa."
          : "Comprovante do cliente referente aos itens recolhidos para devolução ao Bigmais em Casa.",
        ""
      );

  const areaImpressao = document.getElementById("area-impressao-canhoto");
  areaImpressao.innerHTML = via1HTML + via2HTML;

  window.print();
}

// =========================================================================
// EDIÇÃO DE SOLICITAÇÃO EM ANDAMENTO (DEV / TRC)
// =========================================================================

function mascaraCPFPainel(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 11);
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  input.value = value;
}

function mascaraTelefonePainel(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 11);
  if (value.length > 10) {
    value = value.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  } else if (value.length > 6) {
    value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (value.length > 2) {
    value = value.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  }
  input.value = value;
}

function mascaraCEPPainel(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 8);
  value = value.replace(/(\d{5})(\d)/, "$1-$2");
  input.value = value;
}

async function buscarCEPEdicao(input) {
  if (document.getElementById("edit-entregue-loja").checked) return;
  const numeros = input.value.replace(/\D/g, "");
  if (numeros.length !== 8 || /^(\d)\1{7}$/.test(numeros)) return;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
    const dados = await resposta.json();
    if (!dados.erro) {
      document.getElementById("edit-rua").value = dados.logradouro || "";
      document.getElementById("edit-bairro").value = dados.bairro || "";
      if (dados.localidade) {
        document.getElementById("edit-cidade").value = dados.localidade;
      }
      if (dados.uf) {
        document.getElementById("edit-estado").value = dados.uf;
      }
    }
  } catch (erro) {}
}

function alternarEntregueEmLojaEdicao() {
  const marcado = document.getElementById("edit-entregue-loja").checked;
  const idsEndereco = [
    "edit-cep",
    "edit-rua",
    "edit-numero",
    "edit-bairro",
    "edit-cidade",
    "edit-estado",
    "edit-complemento",
  ];

  idsEndereco.forEach((id) => {
    const campo = document.getElementById(id);
    campo.disabled = marcado;
    if (marcado) {
      campo.value = "";
    }
  });

  if (!marcado) {
    if (!document.getElementById("edit-cidade").value) {
      document.getElementById("edit-cidade").value = "Governador Valadares";
    }
    if (!document.getElementById("edit-estado").value) {
      document.getElementById("edit-estado").value = "MG";
    }
  }
}

function alternarCompraInteiraEdicao() {
  const compraInteira = document.getElementById("edit-compra-inteira").checked;
  const aviso = document.getElementById("edit-aviso-compra-inteira");
  const blocoProdutos = document.getElementById("edit-bloco-produtos");

  if (compraInteira) {
    aviso.style.display = "block";
    blocoProdutos.style.display = "none";
  } else {
    aviso.style.display = "none";
    blocoProdutos.style.display = "block";
  }
}

function abrirModalEdicao(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  if (sol.tipo === "DEV" && obterEstornoVinculado(sol.protocolo)) {
    alert(
      "Esta devolução está vinculada a um estorno ativo e não pode ser editada. Cancele o estorno primeiro caso precise alterá-la."
    );
    return;
  }

  protocoloEmEdicao = protocolo;
  itensEmEdicao = JSON.parse(JSON.stringify(sol.produtos || []));
  ultimoCodigoEdicao = "";

  document.getElementById("edicao-titulo").textContent =
    `Editar Solicitação - ${sol.protocolo}`;

  document.getElementById("edit-tipo").value =
    sol.tipo === "TRC" ? "TRC" : "DEV";
  document.getElementById("edit-loja").value = sol.loja || "Loja 8 - Vila Isa";
  document.getElementById("edit-solicitante").value = sol.solicitante || "";
  document.getElementById("edit-pedido").value = sol.numeroPedido || "";

  document.getElementById("edit-nome").value = sol.cliente.nome || "";
  document.getElementById("edit-cpf").value = sol.cliente.cpf || "";
  document.getElementById("edit-telefone").value = sol.cliente.telefone || "";

  const entregueEmLoja = Boolean(sol.entregueEmLoja);
  document.getElementById("edit-entregue-loja").checked = entregueEmLoja;

  document.getElementById("edit-cep").value = sol.endereco?.cep || "";
  document.getElementById("edit-rua").value = sol.endereco?.rua || "";
  document.getElementById("edit-numero").value = sol.endereco?.numero || "";
  document.getElementById("edit-bairro").value = sol.endereco?.bairro || "";
  document.getElementById("edit-cidade").value =
    sol.endereco?.cidade || "Governador Valadares";
  document.getElementById("edit-estado").value = sol.endereco?.estado || "MG";
  document.getElementById("edit-complemento").value =
    sol.endereco?.complemento || "";

  alternarEntregueEmLojaEdicao();

  document.getElementById("edit-motivo").value = sol.motivo || "";
  document.getElementById("edit-observacao").value = sol.observacao || "";

  const compraInteira = Boolean(sol.compraInteira);
  document.getElementById("edit-compra-inteira").checked = compraInteira;
  alternarCompraInteiraEdicao();

  document.getElementById("edit-prod-sku").value = "";
  document.getElementById("edit-prod-ean").value = "";
  document.getElementById("edit-prod-descricao").value = "";
  document.getElementById("edit-prod-unidade").value = "Un";
  document.getElementById("edit-prod-quantidade").value = "";

  renderizarItensEdicao();
  document.getElementById("modal-edicao").showModal();
}

function renderizarItensEdicao() {
  const container = document.getElementById("lista-itens-edicao");

  if (itensEmEdicao.length === 0) {
    container.innerHTML =
      "<p style='color: #d32f2f; font-size: 13px; font-weight: 600;'>Nenhum item na solicitação. Adicione ao menos 1 produto abaixo ou marque 'Compra Inteira'.</p>";
    return;
  }

  container.innerHTML = "";
  itensEmEdicao.forEach((item, index) => {
    container.innerHTML += `
      <div class="item-lista-produto" style="gap: 10px;">
        <div style="flex: 1;">
          <strong>${item.descricao}</strong><br>
          <small style="color: #666;">SKU: ${item.sku} ${item.ean ? `| EAN: ${item.ean}` : ""}</small>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input
            type="text"
            value="${item.quantidade}"
            style="width: 85px; margin-bottom: 0; padding: 6px; text-align: right; font-weight: bold;"
            oninput="editarQuantidadeItemEdicao(${index}, this)"
          />
          <span style="font-size: 13px; font-weight: 600; min-width: 22px;">${item.unidade}</span>
          <button type="button" class="btn-remover" onclick="removerItemEdicao(${index})">Remover</button>
        </div>
      </div>
    `;
  });
}

function editarQuantidadeItemEdicao(index, input) {
  const unidade = itensEmEdicao[index].unidade;
  let apenasNumeros = input.value.replace(/\D/g, "");

  if (apenasNumeros === "") {
    input.value = "";
    itensEmEdicao[index].quantidade = "";
    return;
  }

  if (unidade === "Kg") {
    const formatado = (parseInt(apenasNumeros, 10) / 1000)
      .toFixed(3)
      .replace(".", ",");
    input.value = formatado;
    itensEmEdicao[index].quantidade = formatado;
  } else {
    const formatado = String(parseInt(apenasNumeros, 10));
    input.value = formatado;
    itensEmEdicao[index].quantidade = formatado;
  }
}

function removerItemEdicao(index) {
  itensEmEdicao.splice(index, 1);
  renderizarItensEdicao();
}

function mudarUnidadeEdicao() {
  const unidade = document.getElementById("edit-prod-unidade").value;
  const campoQtd = document.getElementById("edit-prod-quantidade");
  campoQtd.value = "";
  campoQtd.placeholder = unidade === "Kg" ? "0,000" : "0";
}

function formatarQuantidadeEdicao() {
  const unidade = document.getElementById("edit-prod-unidade").value;
  const campoQtd = document.getElementById("edit-prod-quantidade");
  let apenasNumeros = campoQtd.value.replace(/\D/g, "");

  if (apenasNumeros === "") {
    campoQtd.value = "";
    return;
  }

  if (unidade === "Kg") {
    campoQtd.value = (parseInt(apenasNumeros, 10) / 1000)
      .toFixed(3)
      .replace(".", ",");
  } else {
    campoQtd.value = parseInt(apenasNumeros, 10);
  }
}

function aoDigitarCodigoEdicao(tipo, input) {
  if (tipo === "EAN") {
    input.value = input.value.replace(/\D/g, "").slice(0, 13);
  } else {
    input.value = input.value.replace(/\D/g, "");
  }

  const codigoAtual = input.value.trim();

  if (
    ultimoCodigoEdicao !== "" &&
    `${tipo}:${codigoAtual}` !== ultimoCodigoEdicao
  ) {
    ultimoCodigoEdicao = "";
    if (tipo === "SKU") {
      document.getElementById("edit-prod-ean").value = "";
    } else {
      document.getElementById("edit-prod-sku").value = "";
    }
    document.getElementById("edit-prod-descricao").value = "";
    document.getElementById("edit-prod-descricao").placeholder =
      "Descrição do produto *";
    document.getElementById("edit-prod-unidade").value = "Un";
    mudarUnidadeEdicao();
  }
}

async function buscarProdutoEdicao(tipo) {
  const campoSku = document.getElementById("edit-prod-sku");
  const campoEan = document.getElementById("edit-prod-ean");
  const campoDesc = document.getElementById("edit-prod-descricao");
  const campoUnidade = document.getElementById("edit-prod-unidade");
  const campoQtd = document.getElementById("edit-prod-quantidade");

  const codigo =
    tipo === "SKU" ? campoSku.value.trim() : campoEan.value.trim();

  if (!codigo || `${tipo}:${codigo}` === ultimoCodigoEdicao) return;
  ultimoCodigoEdicao = `${tipo}:${codigo}`;

  campoDesc.value = "";
  campoDesc.placeholder = "Buscando produto...";

  try {
    const urlConsulta = `${URL_API_PLANILHA}?acao=buscarProduto&tipo=${tipo}&codigo=${encodeURIComponent(codigo)}`;
    const resposta = await fetch(urlConsulta);
    const dados = await resposta.json();

    const codigoAtualNoCampo =
      tipo === "SKU" ? campoSku.value.trim() : campoEan.value.trim();
    if (codigoAtualNoCampo !== codigo) return;

    if (dados.sucesso && dados.encontrado && dados.produto) {
      if (dados.produto.sku) campoSku.value = dados.produto.sku;
      if (dados.produto.ean) campoEan.value = dados.produto.ean;
      if (dados.produto.descricao) campoDesc.value = dados.produto.descricao;

      if (dados.produto.unidade) {
        campoUnidade.value = dados.produto.unidade;
        mudarUnidadeEdicao();
      }

      ultimoCodigoEdicao = `SKU:${campoSku.value.trim()}`;
      campoQtd.focus();
    } else {
      campoDesc.placeholder = "Não encontrado (digite manual) *";
    }
  } catch (erro) {
    campoDesc.placeholder = "Descrição do produto *";
  }
}

function adicionarItemEdicao() {
  const sku = document.getElementById("edit-prod-sku").value.trim();
  const ean = document.getElementById("edit-prod-ean").value.trim();
  const descricao = document.getElementById("edit-prod-descricao").value.trim();
  const unidade = document.getElementById("edit-prod-unidade").value;
  const quantidade = document.getElementById("edit-prod-quantidade").value.trim();

  if (
    !sku ||
    !descricao ||
    !quantidade ||
    quantidade === "0" ||
    quantidade === "0,000"
  ) {
    alert(
      "Informe ao menos SKU, Descrição e Quantidade válida para incluir o item!"
    );
    return;
  }

  const jaExiste = itensEmEdicao.some(
    (item) => item.sku === sku || (ean !== "" && item.ean === ean)
  );

  if (jaExiste) {
    alert(
      "Este produto (SKU ou EAN) já está na lista! Altere a quantidade diretamente no item listado acima."
    );
    return;
  }

  itensEmEdicao.push({ ean, sku, descricao, unidade, quantidade });

  document.getElementById("edit-prod-sku").value = "";
  document.getElementById("edit-prod-ean").value = "";
  document.getElementById("edit-prod-descricao").value = "";
  document.getElementById("edit-prod-unidade").value = "Un";
  document.getElementById("edit-prod-quantidade").value = "";
  ultimoCodigoEdicao = "";
  document.getElementById("edit-prod-sku").focus();

  renderizarItensEdicao();
}

async function salvarEdicaoSolicitacao() {
  const tipo = document.getElementById("edit-tipo").value;
  const loja = document.getElementById("edit-loja").value;
  const solicitante = document.getElementById("edit-solicitante").value.trim();
  const numeroPedido = document
    .getElementById("edit-pedido")
    .value.trim()
    .replace(/^#+/, "");

  const nome = document.getElementById("edit-nome").value.trim();
  const cpf = document.getElementById("edit-cpf").value.trim();
  const telefone = document.getElementById("edit-telefone").value.trim();

  const entregueEmLoja = document.getElementById("edit-entregue-loja").checked;
  const compraInteira = document.getElementById("edit-compra-inteira").checked;
  const cep = document.getElementById("edit-cep").value.trim();
  const rua = document.getElementById("edit-rua").value.trim();
  const numero = document.getElementById("edit-numero").value.trim();
  const bairro = document.getElementById("edit-bairro").value.trim();
  const cidade = document.getElementById("edit-cidade").value.trim();
  const estado = document.getElementById("edit-estado").value.trim();
  const complemento = document.getElementById("edit-complemento").value.trim();

  const motivo = document.getElementById("edit-motivo").value.trim();
  const observacao = document.getElementById("edit-observacao").value.trim();

  if (!solicitante || !numeroPedido || !nome || !cpf || !telefone || !motivo) {
    alert("Preencha todos os campos obrigatórios antes de salvar.");
    return;
  }

  if (
    !entregueEmLoja &&
    (!cep || !rua || !numero || !bairro || !cidade || !estado)
  ) {
    alert(
      "Preencha o endereço completo de coleta ou marque a opção 'Entregue em Loja'."
    );
    return;
  }

  if (!compraInteira) {
    const temItemInvalido = itensEmEdicao.some(
      (i) => !i.quantidade || i.quantidade === "0" || i.quantidade === "0,000"
    );

    if (itensEmEdicao.length === 0 || temItemInvalido) {
      alert(
        "A solicitação precisa ter ao menos 1 produto com quantidade maior que zero ou estar marcada como 'Compra Inteira'."
      );
      return;
    }
  }

  const botao = document.getElementById("btn-salvar-edicao");
  botao.disabled = true;
  botao.textContent = "Salvando Alterações...";

  const dadosEditados = {
    tipo,
    loja,
    solicitante,
    numeroPedido,
    motivo,
    observacao,
    entregueEmLoja,
    compraInteira,
    cliente: { nome, cpf, telefone },
    endereco: entregueEmLoja
      ? {
          cep: "",
          rua: "ENTREGUE EM LOJA",
          numero: "",
          bairro: "",
          cidade: "",
          estado: "",
          complemento: "",
        }
      : { cep, rua, numero, bairro, cidade, estado, complemento },
    produtos: compraInteira ? [] : [...itensEmEdicao],
  };

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "editar",
        protocoloOriginal: protocoloEmEdicao,
        dados: dadosEditados,
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocoloEmEdicao
      );
      if (indice !== -1) {
        cacheSolicitacoes[indice] = resultado.dadosAtualizados;
      }

      document.getElementById("modal-edicao").close();
      renderizarTabela(false);
      alert(
        `Solicitação ${resultado.dadosAtualizados.protocolo} atualizada com sucesso!`
      );
    } else {
      alert("Erro ao editar na planilha: " + resultado.erro);
    }
  } catch (erro) {
    alert("Falha de conexão ao tentar salvar as alterações.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar Alterações";
  }
}

// =========================================================================
// MODAL DE CONFERÊNCIA DE ITENS RECEBIDOS
// =========================================================================

function abrirModalConferencia(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  if (sol.tipo === "DEV" && obterEstornoVinculado(sol.protocolo)) {
    alert(
      "Esta devolução está vinculada a um estorno ativo e não pode ser alterada."
    );
    return;
  }

  protocoloEmConferencia = protocolo;
  itensEmConferencia = JSON.parse(JSON.stringify(sol.produtos || []));
  compraInteiraEmConferencia = Boolean(sol.compraInteira);
  ultimoCodigoConferencia = "";

  document.getElementById("conferencia-titulo").textContent =
    `Conferência de Itens Recolhidos - ${protocolo}`;

  document.getElementById("conferencia-subtitulo").textContent =
    compraInteiraEmConferencia
      ? "Esta solicitação está marcada como COMPRA INTEIRA. Você pode confirmar a conclusão diretamente ou incluir itens conferidos abaixo, se desejar."
      : "Confirme as quantidades efetivamente recebidas, remova itens não recolhidos ou inclua novos itens antes de concluir.";

  document.getElementById("conf-sku").value = "";
  document.getElementById("conf-ean").value = "";
  document.getElementById("conf-descricao").value = "";
  document.getElementById("conf-descricao").placeholder = "Descrição do produto *";
  document.getElementById("conf-unidade").value = "Un";
  document.getElementById("conf-quantidade").value = "";

  renderizarItensConferencia();
  document.getElementById("modal-conferencia").showModal();
  if (!compraInteiraEmConferencia) {
    document.getElementById("conf-sku").focus();
  }
}

function renderizarItensConferencia() {
  const container = document.getElementById("lista-itens-conferencia");

  if (itensEmConferencia.length === 0) {
    if (compraInteiraEmConferencia) {
      container.innerHTML =
        "<div class='aviso-compra-inteira'><strong>Compra Inteira:</strong> Conferência total do pedido. Clique em <strong>Confirmar Recebimento e Concluir</strong> ou adicione itens avulsos abaixo se desejar discriminá-los.</div>";
    } else {
      container.innerHTML =
        "<p style='color: #d32f2f; font-size: 13px; font-weight: 600;'>Nenhum item na lista. Adicione ao menos 1 item recolhido abaixo.</p>";
    }
    return;
  }

  container.innerHTML = "";

  itensEmConferencia.forEach((item, index) => {
    container.innerHTML += `
      <div class="item-lista-produto" style="gap: 10px;">
        <div style="flex: 1;">
          <strong>${item.descricao}</strong><br>
          <small style="color: #666;">SKU: ${item.sku} ${item.ean ? `| EAN: ${item.ean}` : ""}</small>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input
            type="text"
            value="${item.quantidade}"
            style="width: 85px; margin-bottom: 0; padding: 6px; text-align: right; font-weight: bold;"
            oninput="editarQuantidadeItemConferencia(${index}, this)"
          />
          <span style="font-size: 13px; font-weight: 600; min-width: 22px;">${item.unidade}</span>
          <button type="button" class="btn-remover" onclick="removerItemConferencia(${index})">Remover</button>
        </div>
      </div>
    `;
  });
}

function editarQuantidadeItemConferencia(index, input) {
  const unidade = itensEmConferencia[index].unidade;
  let apenasNumeros = input.value.replace(/\D/g, "");

  if (apenasNumeros === "") {
    input.value = "";
    itensEmConferencia[index].quantidade = "";
    return;
  }

  if (unidade === "Kg") {
    const formatado = (parseInt(apenasNumeros, 10) / 1000)
      .toFixed(3)
      .replace(".", ",");
    input.value = formatado;
    itensEmConferencia[index].quantidade = formatado;
  } else {
    const formatado = String(parseInt(apenasNumeros, 10));
    input.value = formatado;
    itensEmConferencia[index].quantidade = formatado;
  }
}

function removerItemConferencia(index) {
  itensEmConferencia.splice(index, 1);
  renderizarItensConferencia();
}

function mudarUnidadeConferencia() {
  const unidade = document.getElementById("conf-unidade").value;
  const campoQtd = document.getElementById("conf-quantidade");
  campoQtd.value = "";
  campoQtd.placeholder = unidade === "Kg" ? "0,000" : "0";
}

function formatarQuantidadeConferencia() {
  const unidade = document.getElementById("conf-unidade").value;
  const campoQtd = document.getElementById("conf-quantidade");
  let apenasNumeros = campoQtd.value.replace(/\D/g, "");

  if (apenasNumeros === "") {
    campoQtd.value = "";
    return;
  }

  if (unidade === "Kg") {
    campoQtd.value = (parseInt(apenasNumeros, 10) / 1000)
      .toFixed(3)
      .replace(".", ",");
  } else {
    campoQtd.value = parseInt(apenasNumeros, 10);
  }
}

function aoDigitarCodigoConferencia(tipo, input) {
  if (tipo === "EAN") {
    input.value = input.value.replace(/\D/g, "").slice(0, 13);
  } else {
    input.value = input.value.replace(/\D/g, "");
  }

  const codigoAtual = input.value.trim();

  if (
    ultimoCodigoConferencia !== "" &&
    `${tipo}:${codigoAtual}` !== ultimoCodigoConferencia
  ) {
    ultimoCodigoConferencia = "";
    if (tipo === "SKU") {
      document.getElementById("conf-ean").value = "";
    } else {
      document.getElementById("conf-sku").value = "";
    }
    document.getElementById("conf-descricao").value = "";
    document.getElementById("conf-descricao").placeholder =
      "Descrição do produto *";
    document.getElementById("conf-unidade").value = "Un";
    mudarUnidadeConferencia();
  }
}

async function buscarProdutoConferencia(tipo) {
  const campoSku = document.getElementById("conf-sku");
  const campoEan = document.getElementById("conf-ean");
  const campoDesc = document.getElementById("conf-descricao");
  const campoUnidade = document.getElementById("conf-unidade");
  const campoQtd = document.getElementById("conf-quantidade");

  const codigo =
    tipo === "SKU" ? campoSku.value.trim() : campoEan.value.trim();

  if (!codigo || `${tipo}:${codigo}` === ultimoCodigoConferencia) return;
  ultimoCodigoConferencia = `${tipo}:${codigo}`;

  campoDesc.value = "";
  campoDesc.placeholder = "Buscando produto...";

  try {
    const urlConsulta = `${URL_API_PLANILHA}?acao=buscarProduto&tipo=${tipo}&codigo=${encodeURIComponent(codigo)}`;
    const resposta = await fetch(urlConsulta);
    const dados = await resposta.json();

    const codigoAtualNoCampo =
      tipo === "SKU" ? campoSku.value.trim() : campoEan.value.trim();
    if (codigoAtualNoCampo !== codigo) return;

    if (dados.sucesso && dados.encontrado && dados.produto) {
      if (dados.produto.sku) campoSku.value = dados.produto.sku;
      if (dados.produto.ean) campoEan.value = dados.produto.ean;
      if (dados.produto.descricao) campoDesc.value = dados.produto.descricao;

      if (dados.produto.unidade) {
        campoUnidade.value = dados.produto.unidade;
        mudarUnidadeConferencia();
      }

      ultimoCodigoConferencia = `SKU:${campoSku.value.trim()}`;
      campoQtd.focus();
    } else {
      campoDesc.placeholder = "Não encontrado (digite manual) *";
    }
  } catch (erro) {
    campoDesc.placeholder = "Descrição do produto *";
  }
}

function adicionarItemConferencia() {
  const sku = document.getElementById("conf-sku").value.trim();
  const ean = document.getElementById("conf-ean").value.trim();
  const descricao = document.getElementById("conf-descricao").value.trim();
  const unidade = document.getElementById("conf-unidade").value;
  const quantidade = document.getElementById("conf-quantidade").value.trim();

  if (
    !sku ||
    !descricao ||
    !quantidade ||
    quantidade === "0" ||
    quantidade === "0,000"
  ) {
    alert(
      "Informe ao menos SKU, Descrição e Quantidade válida para incluir o item!"
    );
    return;
  }

  const jaExiste = itensEmConferencia.some(
    (item) => item.sku === sku || (ean !== "" && item.ean === ean)
  );

  if (jaExiste) {
    alert(
      "Este produto (SKU ou EAN) já está na lista de conferência! Altere a quantidade diretamente no item listado acima."
    );
    return;
  }

  itensEmConferencia.push({ ean, sku, descricao, unidade, quantidade });

  document.getElementById("conf-sku").value = "";
  document.getElementById("conf-ean").value = "";
  document.getElementById("conf-descricao").value = "";
  document.getElementById("conf-descricao").placeholder = "Descrição do produto *";
  document.getElementById("conf-unidade").value = "Un";
  document.getElementById("conf-quantidade").value = "";
  document.getElementById("conf-quantidade").placeholder = "Qtd *";
  ultimoCodigoConferencia = "";
  document.getElementById("conf-sku").focus();

  renderizarItensConferencia();
}

async function confirmarConclusaoConferencia() {
  const temItemInvalido = itensEmConferencia.some(
    (i) => !i.quantidade || i.quantidade === "0" || i.quantidade === "0,000"
  );

  if (
    (!compraInteiraEmConferencia && itensEmConferencia.length === 0) ||
    temItemInvalido
  ) {
    alert(
      "Verifique os itens: é obrigatório ter ao menos 1 item com quantidade maior que zero."
    );
    return;
  }

  const botao = document.getElementById("btn-confirmar-conclusao");
  botao.disabled = true;
  botao.textContent = "Concluindo na Planilha...";

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "atualizarStatus",
        protocolo: protocoloEmConferencia,
        novoStatus: "Concluída",
        produtosConferidos: itensEmConferencia,
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocoloEmConferencia
      );
      const solConcluida = indice !== -1 ? cacheSolicitacoes[indice] : null;
      if (solConcluida) {
        solConcluida.status = "Concluída";
        solConcluida.produtos = [...itensEmConferencia];
      }

      document.getElementById("modal-conferencia").close();
      renderizarTabela(false);

      if (solConcluida && solConcluida.tipo === "DEV") {
        const abrirEstorno = confirm(
          `Devolução ${protocoloEmConferencia} concluída com sucesso!\n\nDeseja abrir agora a Solicitação de Estorno (EST) já preenchida com os dados deste pedido?`
        );
        if (abrirEstorno) {
          window.location.href = `estorno/index.html?dev=${protocoloEmConferencia}`;
        }
      } else {
        alert(
          `Solicitação ${protocoloEmConferencia} concluída com sucesso!\n\nA opção "WhatsApp Conclusão" no menu já está pronta.`
        );
      }
    } else {
      alert("Erro ao concluir na planilha: " + resultado.erro);
    }
  } catch (erro) {
    alert("Falha de conexão ao tentar concluir a solicitação.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar Recebimento e Concluir";
  }
}

// =========================================================================
// MODAL DE CANCELAMENTO E REABERTURA
// =========================================================================

function abrirModalCancelamento(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (sol && sol.tipo === "DEV" && obterEstornoVinculado(sol.protocolo)) {
    alert(
      "Esta devolução está vinculada a um estorno ativo e não pode ser cancelada. Cancele o estorno primeiro."
    );
    return;
  }

  protocoloEmCancelamento = protocolo;

  document.getElementById("cancelamento-titulo").textContent =
    `Cancelar Solicitação - ${protocolo}`;
  document.getElementById("canc-responsavel").value = "";
  document.getElementById("canc-motivo-select").value = "";
  document.getElementById("canc-motivo-outro").value = "";
  document.getElementById("grupo-canc-outro").style.display = "none";

  document.getElementById("modal-cancelamento").showModal();
  document.getElementById("canc-responsavel").focus();
}

function verificarOutroMotivoCancelamento() {
  const select = document.getElementById("canc-motivo-select").value;
  const grupoOutro = document.getElementById("grupo-canc-outro");

  if (select === "OUTRO") {
    grupoOutro.style.display = "flex";
    document.getElementById("canc-motivo-outro").focus();
  } else {
    grupoOutro.style.display = "none";
    document.getElementById("canc-motivo-outro").value = "";
  }
}

async function confirmarCancelamentoModal() {
  const responsavel = document.getElementById("canc-responsavel").value.trim();
  const motivoSelect = document.getElementById("canc-motivo-select").value;
  const motivoOutro = document.getElementById("canc-motivo-outro").value.trim();

  if (!responsavel) {
    alert("Informe o nome de quem está cancelando a solicitação.");
    document.getElementById("canc-responsavel").focus();
    return;
  }

  if (!motivoSelect) {
    alert("Selecione o motivo do cancelamento.");
    document.getElementById("canc-motivo-select").focus();
    return;
  }

  if (motivoSelect === "OUTRO" && !motivoOutro) {
    alert("Descreva o motivo do cancelamento no campo de texto.");
    document.getElementById("canc-motivo-outro").focus();
    return;
  }

  const motivoFinal =
    motivoSelect === "OUTRO" ? `Outro: ${motivoOutro}` : motivoSelect;

  const botao = document.getElementById("btn-confirmar-cancelamento");
  botao.disabled = true;
  botao.textContent = "Cancelando...";

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "atualizarStatus",
        protocolo: protocoloEmCancelamento,
        novoStatus: "Cancelada",
        motivoCancelamento: motivoFinal,
        responsavelCancelamento: responsavel,
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocoloEmCancelamento
      );
      if (indice !== -1) {
        cacheSolicitacoes[indice].status = "Cancelada";
        cacheSolicitacoes[indice].motivoCancelamento = motivoFinal;
        cacheSolicitacoes[indice].responsavelCancelamento = responsavel;
      }

      document.getElementById("modal-cancelamento").close();
      renderizarTabela(false);
      alert(`Solicitação ${protocoloEmCancelamento} cancelada com sucesso.`);
    } else {
      alert("Erro ao cancelar na planilha: " + resultado.erro);
    }
  } catch (erro) {
    alert("Falha de conexão ao tentar cancelar a solicitação.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar Cancelamento";
  }
}

async function reabrirSolicitacao(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  if (sol.tipo === "DEV" && obterEstornoVinculado(sol.protocolo)) {
    alert(
      "Esta devolução está vinculada a um estorno ativo e não pode ser reaberta. Cancele o estorno primeiro."
    );
    return;
  }

  if (
    sol.tipo === "EST" &&
    sol.status === "Cancelada" &&
    sol.protocoloDevolucao
  ) {
    const devJaOcupada = obterEstornoVinculado(
      sol.protocoloDevolucao,
      sol.protocolo
    );
    if (devJaOcupada) {
      alert(
        `Não é possível reabrir este estorno porque a devolução ${sol.protocoloDevolucao} já foi vinculada ao estorno ${devJaOcupada.protocolo}.`
      );
      return;
    }
  }

  const confirmar = confirm(
    `Deseja reabrir a solicitação ${protocolo} (atualmente "${sol.status}") e voltar o status para "Em andamento"?`
  );

  if (!confirmar) return;

  try {
    const resposta = await fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "atualizarStatus",
        protocolo: protocolo,
        novoStatus: "Em andamento",
      }),
    });

    const resultado = await resposta.json();
    if (resultado.sucesso) {
      const indice = cacheSolicitacoes.findIndex(
        (s) => s.protocolo === protocolo
      );
      if (indice !== -1) {
        cacheSolicitacoes[indice].status = "Em andamento";
        delete cacheSolicitacoes[indice].motivoCancelamento;
        delete cacheSolicitacoes[indice].responsavelCancelamento;
      }
      renderizarTabela(false);
      alert(
        `Solicitação ${protocolo} reaberta! O status voltou para "Em andamento".`
      );
    } else {
      alert("Erro ao reabrir na planilha: " + resultado.erro);
    }
  } catch (erro) {
    alert("Falha de conexão ao tentar reabrir a solicitação.");
  }
}

// =========================================================================
// DETALHES E WHATSAPP (DEV, TRC e EST)
// =========================================================================

function verDetalhes(protocolo) {
  const sol = cacheSolicitacoes.find((s) => s.protocolo === protocolo);
  if (!sol) return;

  const isEstorno = sol.tipo === "EST";
  const tituloTipo =
    sol.tipo === "TRC" ? "Troca" : isEstorno ? "Estorno" : "Devolução";
  document.getElementById("detalhe-titulo").textContent =
    `${sol.protocolo} — ${tituloTipo} (${sol.status})`;

  const blocoCancelamentoHTML =
    sol.status === "Cancelada" && sol.motivoCancelamento
      ? `<div style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px; margin-top: 8px; color: #991b1b;">
           <p style="margin-bottom: 2px;"><strong>Motivo do Cancelamento:</strong> ${sol.motivoCancelamento}</p>
           ${sol.responsavelCancelamento ? `<p style="margin-bottom: 0;"><strong>Cancelado por:</strong> ${sol.responsavelCancelamento}</p>` : ""}
         </div>`
      : "";

  const botoesModal = document.getElementById("detalhe-botoes");

  if (isEstorno) {
    document.getElementById("detalhe-corpo").innerHTML = `
      <p><strong>Loja:</strong> ${sol.loja || "Não informada"} | <strong>Data de Solicitação:</strong> ${sol.dataSolicitacao}</p>
      <p><strong>Solicitante:</strong> ${sol.solicitante} | <strong>Pedido:</strong> #${sol.numeroPedido}</p>
      ${sol.protocoloDevolucao ? `<p><strong>Devolução Vinculada:</strong> ${sol.protocoloDevolucao}</p>` : ""}
      <p><strong>Motivo:</strong> ${sol.motivo}</p>
      ${sol.observacao ? `<p><strong>Observação:</strong> ${sol.observacao}</p>` : ""}
      ${blocoCancelamentoHTML}
      <hr style="margin: 12px 0; border: none; border-top: 1px solid #eee;">
      <p><strong>Cliente:</strong> ${sol.cliente.nome} | <strong>CPF:</strong> ${sol.cliente.cpf}</p>
      <p><strong>Sequência Cliente (SEQ):</strong> ${sol.sequenciaCliente || "-"} | <strong>Telefone:</strong> ${sol.cliente.telefone}</p>
      <hr style="margin: 12px 0; border: none; border-top: 1px solid #eee;">
      <p><strong>NF do Pedido:</strong> ${sol.nfPedido || "-"} | <strong>NF da Devolução:</strong> ${sol.nfDevolucao || "-"}</p>
      <p><strong>Valor do Pedido:</strong> ${sol.valorPedido || "-"} | <strong>Valor Devolvido:</strong> <strong style="color: #0369a1;">${sol.valorDevolvido || sol.valorEstorno || "-"}</strong></p>
      <p><strong>Forma de Pagamento:</strong> ${sol.formaPagamento || "-"}</p>
    `;

    botoesModal.innerHTML = `
      <button type="button" class="btn-azul" onclick="document.getElementById('modal-detalhes').close(); abrirModalEmailEstorno('${sol.protocolo}')">
        Copiar E-mail Financeiro
      </button>
      <button type="button" class="btn-cancelar" onclick="document.getElementById('modal-detalhes').close()">
        Fechar
      </button>
    `;
  } else {
    const temItensIndividuais = sol.produtos && sol.produtos.length > 0;
    const isCompraInteira = Boolean(sol.compraInteira) && !temItensIndividuais;
    const estornoVinc =
      sol.tipo === "DEV" ? obterEstornoVinculado(sol.protocolo) : null;

    const listaProdutosHTML = isCompraInteira
      ? `<div class="aviso-compra-inteira" style="margin-top: 6px;">
           <strong>Compra Inteira:</strong> Devolução/troca integral de todos os itens do pedido <strong>#${sol.numeroPedido}</strong>.
         </div>`
      : `<ul style="margin-left: 20px; margin-top: 5px;">${sol.produtos
          .map(
            (p) =>
              `<li><strong>${p.quantidade} ${p.unidade}</strong> x ${p.descricao} <small>(SKU: ${p.sku}${p.ean ? ` | EAN: ${p.ean}` : ""})</small></li>`
          )
          .join("")}</ul>`;

    const tituloLista =
      sol.status === "Concluída"
        ? "Itens conferidos / recebidos:"
        : "Itens da solicitação:";

    const enderecoDetalhesHTML = sol.entregueEmLoja
      ? `<span class="badge-loja-entrega" style="font-size: 12px;">ENTREGUE EM LOJA (Cliente trouxe o produto até a loja)</span>`
      : `${sol.endereco.rua}, ${sol.endereco.numero} - ${sol.endereco.bairro}, ${sol.endereco.cidade}/${sol.endereco.estado} - CEP: ${sol.endereco.cep} ${sol.endereco.complemento ? `(${sol.endereco.complemento})` : ""}`;

    const mostrarCanhoto = sol.tipo === "DEV" || sol.tipo === "TRC";

    document.getElementById("detalhe-corpo").innerHTML = `
      <p><strong>Loja:</strong> ${sol.loja || "Não informada"} | <strong>Data:</strong> ${sol.dataSolicitacao}</p>
      <p><strong>Solicitante:</strong> ${sol.solicitante} | <strong>Pedido:</strong> #${sol.numeroPedido}</p>
      ${estornoVinc ? `<p><strong>Estorno Vinculado:</strong> <span class="badge-vinculada-est">${estornoVinc.protocolo} (${estornoVinc.status}) — DEV bloqueada</span></p>` : ""}
      <p><strong>Motivo:</strong> ${sol.motivo}</p>
      ${sol.observacao ? `<p><strong>Observação:</strong> ${sol.observacao}</p>` : ""}
      ${blocoCancelamentoHTML}
      <hr style="margin: 12px 0; border: none; border-top: 1px solid #eee;">
      <p><strong>Cliente:</strong> ${sol.cliente.nome} (CPF: ${sol.cliente.cpf})</p>
      <p><strong>Telefone:</strong> ${sol.cliente.telefone}</p>
      <p><strong>Coleta / Entrega:</strong> ${enderecoDetalhesHTML}</p>
      <hr style="margin: 12px 0; border: none; border-top: 1px solid #eee;">
      <p><strong>${tituloLista}</strong></p>
      ${listaProdutosHTML}
    `;

    botoesModal.innerHTML = `
      ${
        mostrarCanhoto
          ? `<button type="button" class="btn-azul" onclick="document.getElementById('modal-detalhes').close(); imprimirCanhotoColeta('${sol.protocolo}')">
              Imprimir Canhoto (2 Vias)
            </button>`
          : ""
      }
      <button type="button" class="btn-cancelar" onclick="document.getElementById('modal-detalhes').close()">
        Fechar
      </button>
    `;
  }

  document.getElementById("modal-detalhes").showModal();
}

function enviarWhatsApp(protocolo) {
  const indice = cacheSolicitacoes.findIndex((s) => s.protocolo === protocolo);
  if (indice === -1) return;

  const sol = cacheSolicitacoes[indice];

  let telefoneLimpo = sol.cliente.telefone.replace(/\D/g, "");
  if (!telefoneLimpo.startsWith("55")) {
    telefoneLimpo = "55" + telefoneLimpo;
  }

  if (sol.tipo === "EST") {
    const valorEstornar = sol.valorDevolvido || sol.valorEstorno || "R$ 0,00";
    const msgEstorno =
      sol.status === "Concluída"
        ? `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

O estorno referente ao pedido #${sol.numeroPedido} (Protocolo: ${sol.protocolo}) no valor de ${valorEstornar} foi concluído pelo nosso setor financeiro.

Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`
        : `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

Sua solicitação de estorno referente ao pedido #${sol.numeroPedido} foi registrada com sucesso.

Protocolo: ${sol.protocolo}
Valor: ${valorEstornar}

Nossa equipe já encaminhou os dados para o setor financeiro. Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`;

    window.open(
      `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(msgEstorno)}`,
      "_blank"
    );

    if (!sol.whatsappEnviado) {
      cacheSolicitacoes[indice].whatsappEnviado = true;
      renderizarTabela(false);

      fetch(URL_API_PLANILHA, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          acao: "marcarWhatsApp",
          protocolo: protocolo,
        }),
      }).catch((err) =>
        console.error("Erro ao marcar WhatsApp na planilha:", err)
      );
    }
    return;
  }

  const isTroca = sol.tipo === "TRC";
  const temItensIndividuais = sol.produtos && sol.produtos.length > 0;
  const isCompraInteira = Boolean(sol.compraInteira) && !temItensIndividuais;
  let mensagemWhatsApp = "";

  if (sol.status === "Concluída") {
    const listaItensRecolhidos = isCompraInteira
      ? `- Compra inteira (todos os itens do pedido #${sol.numeroPedido})`
      : sol.produtos
          .map((item) => {
            const unidadeTexto = item.unidade === "Un" ? "" : ` ${item.unidade}`;
            return `${item.quantidade}${unidadeTexto} x ${item.descricao}`;
          })
          .join("\n");

    if (isTroca) {
      mensagemWhatsApp = `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

Sua solicitação de troca referente ao pedido #${sol.numeroPedido} foi concluída com sucesso.

Protocolo: ${sol.protocolo}

Itens trocados: 

${listaItensRecolhidos}

Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`;
    } else {
      mensagemWhatsApp = `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

Sua solicitação de devolução referente ao pedido #${sol.numeroPedido} foi efetuada com sucesso.

Protocolo: ${sol.protocolo}

Itens recolhidos: 

${listaItensRecolhidos}

Entraremos em contato para darmos seguimento ao estorno do valor pago. Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`;
    }
  } else {
    const listaItensTexto = isCompraInteira
      ? `- Compra inteira (todos os itens do pedido #${sol.numeroPedido})`
      : sol.produtos
          .map((item) => {
            const unidadeTexto = item.unidade === "Un" ? "" : ` ${item.unidade}`;
            return `${item.quantidade}${unidadeTexto} x ${item.descricao} - ${item.sku}`;
          })
          .join("\n");

    const tipoTexto = isTroca ? "troca" : "devolução";
    const fraseLogistica = sol.entregueEmLoja
      ? `Conforme combinado, aguardamos a entrega do(s) produto(s) na unidade ${sol.loja || "Bigmais"}.`
      : `Assim que o motorista estiver em rota, entraremos em contato.`;

    mensagemWhatsApp = `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

Sua solicitação de ${tipoTexto} referente ao pedido #${sol.numeroPedido} foi registrada com sucesso.

Protocolo: ${sol.protocolo}

Itens da solicitação: 

${listaItensTexto}

${fraseLogistica} Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`;
  }

  const urlWhatsApp = `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagemWhatsApp)}`;
  window.open(urlWhatsApp, "_blank");

  if (!sol.whatsappEnviado) {
    cacheSolicitacoes[indice].whatsappEnviado = true;
    renderizarTabela(false);

    fetch(URL_API_PLANILHA, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "marcarWhatsApp",
        protocolo: protocolo,
      }),
    }).catch((err) =>
      console.error("Erro ao marcar WhatsApp na planilha:", err)
    );
  }
}

carregarSolicitacoesDaPlanilha();
