let contadorEstorno = parseInt(localStorage.getItem("contador_estorno") || 0, 10);
let listaDevolucoesElegiveisCache = [];
let estornoRecemCriado = null;
let formularioEstornoAlterado = false;

function aplicarSolicitanteLogado(somenteSeVazio = false) {
  if (typeof preencherDadosUsuarioLogado === "function") {
    preencherDadosUsuarioLogado({
      seletoresSolicitante: ["#solicitante"],
      seletoresLoja: [],
      somenteSeVazio,
    });
  }
}

function atualizarProtocoloEstornoLocal() {
  const campoId = document.getElementById("idsolicitacao");
  const campoProtocolo = document.getElementById("protocolo");
  if (!campoId || !campoProtocolo) return;

  const agora = new Date();
  const ano = String(agora.getFullYear()).slice(-2);
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  const seqFormatado = String(contadorEstorno + 1).padStart(4, "0");
  campoId.value = `#${seqFormatado}`;
  campoProtocolo.value = `EST-${ano}${mes}${dia}-${seqFormatado}`;
}

async function inicializarDadosEstorno() {
  const campoData = document.getElementById("datasolicitacao");
  if (!campoData) return;

  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR");
  const horaFormatada = agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  campoData.value = `${dataFormatada} às ${horaFormatada}`;

  atualizarProtocoloEstornoLocal();
  aplicarSolicitanteLogado(true);

  try {
    if (
      typeof URL_API_PLANILHA !== "undefined" &&
      URL_API_PLANILHA.startsWith("http")
    ) {
      const resposta = await fetch(URL_API_PLANILHA);
      const dados = await resposta.json();

      if (dados && dados.sucesso) {
        if (dados.contadores) {
          contadorEstorno = parseInt(dados.contadores.EST || 0, 10);
          localStorage.setItem("contador_estorno", contadorEstorno);
          atualizarProtocoloEstornoLocal();
        }

        if (Array.isArray(dados.solicitacoes)) {
          // Protocolos DEV que já possuem um estorno ativo vinculado
          const devsJaEstornadas = new Set(
            dados.solicitacoes
              .filter(
                (s) =>
                  s.tipo === "EST" &&
                  s.protocoloDevolucao &&
                  s.status !== "Cancelada"
              )
              .map((s) => s.protocoloDevolucao)
          );

          // Regra: Apenas Devoluções (DEV) com status "Concluída" e sem estorno ativo
          listaDevolucoesElegiveisCache = dados.solicitacoes.filter(
            (s) =>
              s.tipo === "DEV" &&
              s.status === "Concluída" &&
              !devsJaEstornadas.has(s.protocolo)
          );

          const params = new URLSearchParams(window.location.search);
          const protoDevParam = params.get("dev");
          if (protoDevParam) {
            const devEncontrada = listaDevolucoesElegiveisCache.find(
              (d) => d.protocolo === protoDevParam
            );
            if (devEncontrada) {
              selecionarDevolucaoVinculo(devEncontrada.protocolo);
            } else {
              alert(
                `A solicitação ${protoDevParam} não está disponível para estorno.\nVerifique se ela é uma Devolução (DEV) com status "Concluída" e sem estorno anterior.`
              );
            }
          }
        }
      }
    }
  } catch (erro) {
    console.warn("Usando contador local de estorno:", erro);
  }
}

// =========================================================================
// LIMPEZA AUTOMÁTICA DOS CAMPOS AO TROCAR OU DESVINCULAR A DEV
// =========================================================================

function limparCamposDadosEstorno() {
  document.getElementById("loja").value = "";
  document.getElementById("nomecliente").value = "";
  document.getElementById("cpfcliente").value = "";
  document.getElementById("sequenciacliente").value = "";
  document.getElementById("telefonecliente").value = "";
  document.getElementById("numeropedido").value = "";
  document.getElementById("nfpedido").value = "";
  document.getElementById("nfdevolucao").value = "";
  document.getElementById("valorpedido").value = "";
  document.getElementById("valordevolvido").value = "";
  document.getElementById("formapagamento").value = "";
  document.getElementById("motivoestorno").value = "";
  document.getElementById("outromotivo").value = "";
  document.getElementById("observacao").value = "";

  verificarOutroMotivoEstorno();
  document.getElementById("cpfcliente").setCustomValidity("");
  document.getElementById("telefonecliente").setCustomValidity("");
  aplicarSolicitanteLogado(true);
}

// =========================================================================
// BUSCA E VÍNCULO COM PROTOCOLO DE DEVOLUÇÃO CONCLUÍDA (DEV)
// =========================================================================

document.addEventListener("click", (e) => {
  if (
    !e.target.closest("#busca-devolucao") &&
    !e.target.closest("#resultados-busca-dev")
  ) {
    const box = document.getElementById("resultados-busca-dev");
    if (box) box.style.display = "none";
  }
});

function filtrarDevolucoesVinculo() {
  const input = document.getElementById("busca-devolucao");
  const box = document.getElementById("resultados-busca-dev");
  const termo = input.value.trim().toLowerCase();
  const termoNumeros = termo.replace(/\D/g, "");

  if (listaDevolucoesElegiveisCache.length === 0) {
    box.innerHTML = `<div class="item-autocomplete-vazio">Nenhuma devolução concluída disponível para estorno.</div>`;
    box.style.display = "block";
    return;
  }

  const filtradas = listaDevolucoesElegiveisCache
    .filter((dev) => {
      if (termo === "") return true;
      const cpfLimpo = (dev.cliente?.cpf || "").replace(/\D/g, "");
      return (
        dev.protocolo.toLowerCase().includes(termo) ||
        (dev.id || "").toLowerCase().includes(termo) ||
        (dev.numeroPedido || "")
          .toLowerCase()
          .includes(termo.replace(/^#+/, "")) ||
        (dev.cliente?.nome || "").toLowerCase().includes(termo) ||
        (termoNumeros !== "" && cpfLimpo.includes(termoNumeros))
      );
    })
    .slice()
    .reverse()
    .slice(0, 10);

  if (filtradas.length === 0) {
    box.innerHTML = `<div class="item-autocomplete-vazio">Nenhuma devolução concluída encontrada para essa busca.</div>`;
    box.style.display = "block";
    return;
  }

  box.innerHTML = filtradas
    .map(
      (dev) => `
      <div class="item-autocomplete-dev" onclick="selecionarDevolucaoVinculo('${dev.protocolo}')">
        <div>
          <strong>${dev.protocolo}</strong> • Pedido #${dev.numeroPedido}
          <span class="badge badge-concluida" style="margin-left: 6px; font-size: 10.5px;">Concluída</span>
        </div>
        <small style="color: #555;">${dev.cliente.nome} (CPF: ${dev.cliente.cpf}) — ${dev.motivo}</small>
      </div>
    `
    )
    .join("");

  box.style.display = "block";
}

function selecionarDevolucaoVinculo(protocoloDev) {
  const dev = listaDevolucoesElegiveisCache.find(
    (d) => d.protocolo === protocoloDev
  );
  if (!dev) return;

  // Limpa todos os campos antes de preencher com a nova DEV selecionada
  limparCamposDadosEstorno();

  document.getElementById("protocolodevolucao").value = dev.protocolo;
  document.getElementById("busca-devolucao").value = dev.protocolo;
  document.getElementById("resultados-busca-dev").style.display = "none";

  if (dev.loja) document.getElementById("loja").value = dev.loja;
  document.getElementById("nomecliente").value = dev.cliente?.nome || "";
  document.getElementById("cpfcliente").value = dev.cliente?.cpf || "";
  document.getElementById("telefonecliente").value =
    dev.cliente?.telefone || "";
  document.getElementById("numeropedido").value = dev.numeroPedido || "";

  const selectMotivo = document.getElementById("motivoestorno");
  const opcoesExistentes = Array.from(selectMotivo.options).map((o) => o.value);

  if (dev.compraInteira && (!dev.produtos || dev.produtos.length === 0)) {
    selectMotivo.value = "Devolução da compra inteira";
    verificarOutroMotivoEstorno();
  } else if (opcoesExistentes.includes(dev.motivo)) {
    selectMotivo.value = dev.motivo;
    verificarOutroMotivoEstorno();
  } else if (dev.motivo) {
    selectMotivo.value = "Outros";
    verificarOutroMotivoEstorno();
    document.getElementById("outromotivo").value = dev.motivo.replace(
      /^Outros:\s*/i,
      ""
    );
  }

  const resumoItens =
    dev.compraInteira && (!dev.produtos || dev.produtos.length === 0)
      ? "Devolução da compra inteira."
      : (dev.produtos || [])
          .map((p) => `${p.quantidade}${p.unidade} x ${p.descricao}`)
          .join(", ");

  if (resumoItens) {
    document.getElementById("observacao").value =
      `Itens devolvidos: ${resumoItens}`;
  }

  document.getElementById("texto-dev-vinculada").innerHTML =
    `✓ Vinculado à devolução concluída <strong>${dev.protocolo}</strong> (Pedido #${dev.numeroPedido}).`;
  document.getElementById("banner-dev-vinculada").style.display = "flex";

  formularioEstornoAlterado = true;
  document.getElementById("sequenciacliente").focus();
}

function desvincularDevolucao(limparFormulario = true) {
  document.getElementById("protocolodevolucao").value = "";
  document.getElementById("busca-devolucao").value = "";
  document.getElementById("banner-dev-vinculada").style.display = "none";
  if (limparFormulario) {
    limparCamposDadosEstorno();
    document.getElementById("busca-devolucao").focus();
  }
}

// =========================================================================
// MÁSCARAS, ATALHOS E VALIDAÇÕES
// =========================================================================

function mascaraMoeda(input) {
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
  input.setCustomValidity("");
}

function copiarValorPedidoParaDevolvido() {
  const valorPedido = document.getElementById("valorpedido").value.trim();
  if (!valorPedido) {
    alert("Preencha primeiro o Valor do Pedido.");
    document.getElementById("valorpedido").focus();
    return;
  }
  document.getElementById("valordevolvido").value = valorPedido;
  formularioEstornoAlterado = true;
}

function converterMoedaParaFloat(textoMoeda) {
  if (!textoMoeda) return 0;
  return (
    parseFloat(textoMoeda.replace(/[R$\s.]/g, "").replace(",", ".")) || 0
  );
}

function mascaraCPF(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 11);
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  input.value = value;
  input.setCustomValidity("");
}

function validarCPFReal(cpf) {
  const numeros = cpf.replace(/\D/g, "");
  if (numeros.length !== 11 || /^(\d)\1{10}$/.test(numeros)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(numeros.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(numeros.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(numeros.charAt(10), 10);
}

function verificarCampoCPF(input) {
  if (input.value.trim() === "") return;
  if (!validarCPFReal(input.value)) {
    input.setCustomValidity("CPF inválido. Verifique os números digitados.");
    input.reportValidity();
  } else {
    input.setCustomValidity("");
  }
}

function mascaraTelefone(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 11);
  if (value.length > 10) {
    value = value.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  } else if (value.length > 6) {
    value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (value.length > 2) {
    value = value.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  }
  input.value = value;
  input.setCustomValidity("");
}

function validarTelefoneReal(telefone) {
  const numeros = telefone.replace(/\D/g, "");
  if (numeros.length < 10 || numeros.length > 11 || /^(\d)\1+$/.test(numeros)) {
    return false;
  }
  if (numeros.startsWith("0")) return false;
  if (numeros.length === 11 && numeros.charAt(2) !== "9") return false;
  if (numeros.length === 10 && numeros.charAt(2) === "9") return false;
  return true;
}

function verificarCampoTelefone(input) {
  if (input.value.trim() === "") return;
  if (!validarTelefoneReal(input.value)) {
    input.setCustomValidity(
      "Telefone inválido. Informe DDD + 8 ou 9 dígitos válidos."
    );
    input.reportValidity();
  } else {
    input.setCustomValidity("");
  }
}

function verificarOutroMotivoEstorno() {
  const selectMotivo = document.getElementById("motivoestorno");
  const divOutro = document.getElementById("campo-outro-motivo");
  const inputOutro = document.getElementById("outromotivo");

  if (selectMotivo.value === "Outros") {
    divOutro.style.display = "flex";
    inputOutro.required = true;
    inputOutro.focus();
  } else {
    divOutro.style.display = "none";
    inputOutro.required = false;
    inputOutro.value = "";
  }
}

window.addEventListener("beforeunload", (evento) => {
  if (formularioEstornoAlterado) {
    evento.preventDefault();
  }
});

function reiniciarTelaEstorno() {
  if (formularioEstornoAlterado) {
    const confirmar = confirm(
      "Tem certeza que deseja limpar todos os campos e reiniciar a tela?"
    );
    if (!confirmar) return;
  }

  document.getElementById("formEstorno").reset();
  desvincularDevolucao(true);

  formularioEstornoAlterado = false;
  inicializarDadosEstorno();
  aplicarSolicitanteLogado(true);
}

// =========================================================================
// E-MAIL FINANCEIRO E WHATSAPP PÓS-SALVAMENTO
// =========================================================================

function montarTextoEmailFinanceiro(sol) {
  const assunto = `Solicitação de Estorno - Pedido #${sol.numeroPedido} | SEQ ${sol.sequenciaCliente}`;
  const linhaDev = sol.protocoloDevolucao
    ? `• Protocolo de Devolução: ${sol.protocoloDevolucao} (uso interno do setor)\n`
    : "";

  const corpo = `Olá,

Segue solicitação de estorno cliente E-Commerce (Bigmais em Casa):

- Data de Solicitação: ${sol.dataSolicitacao}
- Loja: ${sol.loja || "Não informada"}
- Solicitante: ${sol.solicitante}

CONTROLE INTERNO DO SETOR E-COMMERCE (USO EXCLUSIVO DO SETOR — NÃO É CÓDIGO DO FINANCEIRO):

- Protocolo de Estorno: ${sol.protocolo} (uso interno do setor)
${linhaDev}
DADOS DO CLIENTE:

- Nome do Cliente: ${sol.cliente.nome}
- CPF do Cliente: ${sol.cliente.cpf}
- Sequência Cliente (SEQ): ${sol.sequenciaCliente}
- Telefone (WhatsApp): ${sol.cliente.telefone}

DADOS FISCAIS E FINANCEIROS:

- Número do Pedido: #${sol.numeroPedido}
- Nota Fiscal do Pedido (Nº): ${sol.nfPedido}
- Nota Fiscal da Devolução: ${sol.nfDevolucao}
- Valor do Pedido: ${sol.valorPedido}
- Valor Devolvido (a Estornar): ${sol.valorDevolvido}
- Forma de Pagamento: ${sol.formaPagamento}

MOTIVO DA SOLICITAÇÃO:

- Motivo: ${sol.motivo}
- Detalhes / Observação: ${sol.observacao || "Sem observações adicionais."}

Qualquer dúvida estamos à disposição.

Atenciosamente, Equipe E-commerce Bigmais em Casa.`;

  return { assunto, corpo };
}

function abrirModalPosEstorno(sol) {
  estornoRecemCriado = sol;
  const { assunto, corpo } = montarTextoEmailFinanceiro(sol);

  document.getElementById("email-assunto-gerado").value = assunto;
  document.getElementById("email-corpo-gerado").value = corpo;

  const btnCopiar = document.getElementById("btn-copiar-email-fin");
  btnCopiar.textContent = "Copiar Assunto e E-mail";

  document.getElementById("modal-pos-estorno").showModal();
}

async function copiarEmailFinanceiro() {
  const assunto = document.getElementById("email-assunto-gerado").value;
  const corpo = document.getElementById("email-corpo-gerado").value;
  const textoCompleto = `Assunto: ${assunto}\n\n${corpo}`;

  try {
    await navigator.clipboard.writeText(textoCompleto);
    const btn = document.getElementById("btn-copiar-email-fin");
    btn.textContent = "✓ Copiado!";
    setTimeout(() => {
      btn.textContent = "Copiar Assunto e E-mail";
    }, 2500);
  } catch (e) {
    document.getElementById("email-corpo-gerado").select();
    document.execCommand("copy");
  }
}

function enviarWhatsAppEstornoPosSalvar() {
  if (!estornoRecemCriado) return;
  const sol = estornoRecemCriado;

  let telefoneLimpo = sol.cliente.telefone.replace(/\D/g, "");
  if (!telefoneLimpo.startsWith("55")) {
    telefoneLimpo = "55" + telefoneLimpo;
  }

  const mensagem = `Olá, ${sol.cliente.nome}! Aqui é do Bigmais em Casa!

Sua solicitação de estorno referente ao pedido #${sol.numeroPedido} foi registrada com sucesso.

Protocolo: ${sol.protocolo}
Valor a estornar: ${sol.valorDevolvido}

Nossa equipe já encaminhou os dados para o setor financeiro. Qualquer dúvida, estamos à disposição para te ajudar!

Bigmais em Casa, é diferente!`;

  window.open(
    `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`,
    "_blank"
  );

  fetch(URL_API_PLANILHA, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      acao: "marcarWhatsApp",
      protocolo: sol.protocolo,
    }),
  }).catch(() => {});
}

function fecharModalPosEstorno() {
  document.getElementById("modal-pos-estorno").close();
  window.location.href = "../index.html";
}

// =========================================================================
// ENVIO DO FORMULÁRIO
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const elVersao = document.getElementById("versao-sistema");
  if (elVersao && typeof VERSAO_PORTAL !== "undefined") {
    elVersao.textContent = `Versão ${VERSAO_PORTAL}`;
  }

  inicializarDadosEstorno();
  aplicarSolicitanteLogado(false);

  const form = document.getElementById("formEstorno");
  form.addEventListener("input", () => {
    formularioEstornoAlterado = true;
  });

  form.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    const protocoloDevolucao = document
      .getElementById("protocolodevolucao")
      .value.trim();

    if (!protocoloDevolucao) {
      alert(
        "Selecione obrigatoriamente uma Devolução Concluída (DEV) antes de registrar o estorno."
      );
      document.getElementById("busca-devolucao").focus();
      return;
    }

    const valorPedidoTexto = document.getElementById("valorpedido").value.trim();
    const valorDevolvidoTexto = document
      .getElementById("valordevolvido")
      .value.trim();

    const numPedido = converterMoedaParaFloat(valorPedidoTexto);
    const numDevolvido = converterMoedaParaFloat(valorDevolvidoTexto);

    if (numPedido <= 0) {
      alert("Informe um Valor do Pedido válido maior que R$ 0,00.");
      document.getElementById("valorpedido").focus();
      return;
    }

    if (numDevolvido <= 0) {
      alert("Informe um Valor Devolvido / Estorno válido maior que R$ 0,00.");
      document.getElementById("valordevolvido").focus();
      return;
    }

    if (numDevolvido > numPedido) {
      alert("O Valor Devolvido não pode ser maior que o Valor do Pedido.");
      document.getElementById("valordevolvido").focus();
      return;
    }

    const botaoSalvar = document.getElementById("btn-registrar-estorno");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Registrando Estorno...";

    const numeroPedido = document
      .getElementById("numeropedido")
      .value.trim()
      .replace(/^#+/, "");

    const formaPagamento = document.getElementById("formapagamento").value;

    const motivoSelecionado = document.getElementById("motivoestorno").value;
    const motivoFinal =
      motivoSelecionado === "Outros"
        ? `Outros: ${document.getElementById("outromotivo").value.trim()}`
        : motivoSelecionado;

    const novoEstorno = {
      id: document.getElementById("idsolicitacao").value,
      protocolo: document.getElementById("protocolo").value,
      tipo: "EST",
      status: "Em andamento",
      whatsappEnviado: false,
      dataSolicitacao: document.getElementById("datasolicitacao").value,
      loja: document.getElementById("loja").value,
      solicitante: document.getElementById("solicitante").value.trim(),
      numeroPedido: numeroPedido,
      protocoloDevolucao: protocoloDevolucao,
      sequenciaCliente: document.getElementById("sequenciacliente").value.trim(),
      nfPedido: document.getElementById("nfpedido").value.trim(),
      nfDevolucao: document.getElementById("nfdevolucao").value.trim(),
      valorPedido: valorPedidoTexto,
      valorDevolvido: valorDevolvidoTexto,
      valorEstorno: valorDevolvidoTexto,
      formaPagamento: formaPagamento,
      motivo: motivoFinal,
      observacao: document.getElementById("observacao").value.trim(),
      cliente: {
        nome: document.getElementById("nomecliente").value.trim(),
        cpf: document.getElementById("cpfcliente").value.trim(),
        telefone: document.getElementById("telefonecliente").value.trim(),
      },
      endereco: {
        rua: `VINCULADO À DEVOLUÇÃO ${protocoloDevolucao}`,
        cep: "",
        numero: "",
        bairro: "",
        cidade: "",
        estado: "",
        complemento: "",
      },
      produtos: [],
    };

    try {
      const resposta = await fetch(URL_API_PLANILHA, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          acao: "criar",
          dados: novoEstorno,
        }),
      });

      const resultado = await resposta.json();

      if (resultado.sucesso) {
        novoEstorno.id = resultado.idOficial;
        novoEstorno.protocolo = resultado.protocoloOficial;

        contadorEstorno += 1;
        localStorage.setItem("contador_estorno", contadorEstorno);

        formularioEstornoAlterado = false;
        abrirModalPosEstorno(novoEstorno);
      } else {
        alert("A planilha retornou um erro ao salvar: " + resultado.erro);
      }
    } catch (erro) {
      alert("Não foi possível salvar o estorno na planilha: " + erro.message);
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Registrar Estorno";
    }
  });
});