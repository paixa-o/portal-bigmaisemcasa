let contadoresPlanilha = {
  DEV: parseInt(localStorage.getItem("contador_devolucao") || 0, 10),
  TRC: parseInt(localStorage.getItem("contador_troca") || 0, 10),
};

function atualizarPrefixoProtocoloLocal() {
  const campoId = document.getElementById("idsolicitacao");
  const campoProtocolo = document.getElementById("protocolo");
  const tipo = document.getElementById("tiposolicitacao")?.value || "DEV";

  if (!campoId || !campoProtocolo) return;

  const agora = new Date();
  const ano = String(agora.getFullYear()).slice(-2);
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  const baseContador =
    tipo === "TRC" ? contadoresPlanilha.TRC : contadoresPlanilha.DEV;
  const seqFormatado = String(baseContador + 1).padStart(4, "0");

  campoId.value = `#${seqFormatado}`;
  campoProtocolo.value = `${tipo}-${ano}${mes}${dia}-${seqFormatado}`;
}

function alterarModalidadeSolicitacao() {
  const tipo = document.getElementById("tiposolicitacao").value;
  const tituloProdutos = document.getElementById("titulo-produtos-secao");
  const btnSalvar = document.getElementById("btn-registrar-principal");

  if (tipo === "TRC") {
    tituloProdutos.textContent = "Produto(s) para Troca";
    btnSalvar.textContent = "Registrar Troca";
  } else {
    tituloProdutos.textContent = "Produto(s) a Devolver";
    btnSalvar.textContent = "Registrar Devolução";
  }

  atualizarPrefixoProtocoloLocal();
}

function alternarCompraInteira() {
  const compraInteira = document.getElementById("comprainteira").checked;
  const btnAdicionar = document.getElementById("btn-abrir-modal-produto");
  const aviso = document.getElementById("aviso-compra-inteira");
  const lista = document.getElementById("lista-produtos-adicionados");
  const tituloProdutos = document.getElementById("titulo-produtos-secao");

  if (compraInteira) {
    btnAdicionar.style.display = "none";
    aviso.style.display = "block";
    lista.style.display = "none";
    tituloProdutos.classList.remove("obrigatorio");
  } else {
    btnAdicionar.style.display = "inline-block";
    aviso.style.display = "none";
    lista.style.display = "block";
    tituloProdutos.classList.add("obrigatorio");
  }
}

function alternarEntregueEmLoja() {
  const marcado = document.getElementById("entregueemloja").checked;
  const camposObrigatorios = [
    "cepcliente",
    "ruacliente",
    "numerocliente",
    "bairrocliente",
    "cidadecliente",
    "estadocliente",
  ];
  const todosCampos = [...camposObrigatorios, "complementocliente"];

  todosCampos.forEach((id) => {
    const campo = document.getElementById(id);
    campo.disabled = marcado;
    campo.setCustomValidity("");

    if (marcado) {
      campo.required = false;
      campo.value = "";
    } else if (camposObrigatorios.includes(id)) {
      campo.required = true;
    }
  });

  if (!marcado) {
    document.getElementById("cidadecliente").value = "Governador Valadares";
    document.getElementById("estadocliente").value = "MG";
  }
}

async function inicializarDadosAutomaticos() {
  const campoData = document.getElementById("datasolicitacao");
  if (!campoData) return;

  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR");
  const horaFormatada = agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  campoData.value = `${dataFormatada} às ${horaFormatada}`;

  atualizarPrefixoProtocoloLocal();

  try {
    if (
      typeof URL_API_PLANILHA !== "undefined" &&
      URL_API_PLANILHA.startsWith("http")
    ) {
      const resposta = await fetch(URL_API_PLANILHA);
      const dados = await resposta.json();

      if (dados && dados.sucesso && dados.contadores) {
        contadoresPlanilha.DEV = parseInt(dados.contadores.DEV || 0, 10);
        contadoresPlanilha.TRC = parseInt(dados.contadores.TRC || 0, 10);

        localStorage.setItem("contador_devolucao", contadoresPlanilha.DEV);
        localStorage.setItem("contador_troca", contadoresPlanilha.TRC);

        atualizarPrefixoProtocoloLocal();
      }
    }
  } catch (erro) {
    console.warn("Usando contador local:", erro);
  }
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

function mascaraCEP(input) {
  let value = input.value.replace(/\D/g, "").slice(0, 8);
  value = value.replace(/(\d{5})(\d)/, "$1-$2");
  input.value = value;
  input.setCustomValidity("");
}

async function verificarCampoCEP(input) {
  if (document.getElementById("entregueemloja").checked) return;

  const numeros = input.value.replace(/\D/g, "");
  if (numeros === "") return;

  if (numeros.length !== 8 || /^(\d)\1{7}$/.test(numeros)) {
    input.setCustomValidity("CEP inválido. Digite os 8 números do CEP.");
    input.reportValidity();
    return;
  }

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      input.setCustomValidity("CEP não encontrado na base dos Correios.");
      input.reportValidity();
    } else {
      input.setCustomValidity("");
      document.getElementById("ruacliente").value = dados.logradouro || "";
      document.getElementById("bairrocliente").value = dados.bairro || "";
      if (dados.localidade) {
        document.getElementById("cidadecliente").value = dados.localidade;
      }
      if (dados.uf) {
        document.getElementById("estadocliente").value = dados.uf;
      }
    }
  } catch (erro) {
    input.setCustomValidity("");
  }
}

function validarEAN(input) {
  let value = input.value.replace(/\D/g, "");
  if (value.length > 13) {
    value = value.slice(0, 13);
  }
  input.value = value;
}

function validarSKU(input) {
  let value = input.value.replace(/\D/g, "");
  input.value = value;
}

let ultimoCodigoBuscado = "";

function aoDigitarCodigoModal(tipo, input) {
  if (tipo === "EAN") {
    validarEAN(input);
  } else {
    validarSKU(input);
  }

  const codigoAtual = input.value.trim();

  if (
    ultimoCodigoBuscado !== "" &&
    `${tipo}:${codigoAtual}` !== ultimoCodigoBuscado
  ) {
    ultimoCodigoBuscado = "";
    if (tipo === "SKU") {
      document.getElementById("modal-ean").value = "";
    } else {
      document.getElementById("modal-sku").value = "";
    }
    document.getElementById("modal-descricao").value = "";
    document.getElementById("modal-descricao").placeholder =
      "Ex: Leite Integral 1L";
    document.getElementById("modal-unidade").value = "Un";
    mudarUnidadeModal();
  }
}

async function buscarProdutoAutomatico(tipo) {
  const campoSku = document.getElementById("modal-sku");
  const campoEan = document.getElementById("modal-ean");
  const campoDesc = document.getElementById("modal-descricao");
  const campoUnidade = document.getElementById("modal-unidade");
  const campoQtd = document.getElementById("modal-quantidade");

  const codigo =
    tipo === "SKU" ? campoSku.value.trim() : campoEan.value.trim();

  if (!codigo || `${tipo}:${codigo}` === ultimoCodigoBuscado) return;
  ultimoCodigoBuscado = `${tipo}:${codigo}`;

  const placeholderOriginal = campoDesc.placeholder;
  campoDesc.value = "";
  campoDesc.placeholder = "Buscando produto na planilha...";

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
        mudarUnidadeModal();
      }

      ultimoCodigoBuscado = `SKU:${campoSku.value.trim()}`;
      campoQtd.focus();
    } else {
      campoDesc.placeholder = "Produto não encontrado (digite manualmente)";
    }
  } catch (erro) {
    console.warn("Erro ao consultar produto na planilha:", erro);
    campoDesc.placeholder = placeholderOriginal;
  }
}

let produtosDaDevolucao = [];

function limparCamposModal() {
  ultimoCodigoBuscado = "";
  document.getElementById("modal-sku").value = "";
  document.getElementById("modal-ean").value = "";
  document.getElementById("modal-descricao").value = "";
  document.getElementById("modal-descricao").placeholder =
    "Ex: Leite Integral 1L";
  document.getElementById("modal-unidade").value = "Un";
  document.getElementById("modal-quantidade").value = "";
  document.getElementById("modal-quantidade").placeholder = "0";
  document.getElementById("modal-sku").focus();
}

function abrirModalProduto() {
  limparCamposModal();
  document.getElementById("modal-produto").showModal();
  document.getElementById("modal-sku").focus();
}

function fecharModalProduto() {
  document.getElementById("modal-produto").close();
}

function mudarUnidadeModal() {
  const unidade = document.getElementById("modal-unidade").value;
  const campoQtd = document.getElementById("modal-quantidade");
  campoQtd.value = "";
  campoQtd.placeholder = unidade === "Kg" ? "0,000" : "0";
}

function formatarQuantidadeModal() {
  const unidade = document.getElementById("modal-unidade").value;
  const campoQtd = document.getElementById("modal-quantidade");
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

function salvarProdutoNaLista() {
  const sku = document.getElementById("modal-sku").value.trim();
  const ean = document.getElementById("modal-ean").value.trim();
  const descricao = document.getElementById("modal-descricao").value.trim();
  const unidade = document.getElementById("modal-unidade").value;
  const quantidade = document.getElementById("modal-quantidade").value.trim();

  if (
    !sku ||
    !ean ||
    !descricao ||
    !quantidade ||
    quantidade === "0" ||
    quantidade === "0,000"
  ) {
    alert("Por favor, preencha todos os campos do produto corretamente!");
    return;
  }

  const jaExiste = produtosDaDevolucao.some(
    (item) => item.sku === sku || item.ean === ean
  );

  if (jaExiste) {
    alert(
      "Este produto (SKU ou EAN) já foi adicionado à lista! Se precisar alterar a quantidade, remova o item da lista e adicione novamente."
    );
    return;
  }

  produtosDaDevolucao.push({ ean, sku, descricao, unidade, quantidade });
  formularioAlterado = true;

  atualizarTelaProdutos();
  limparCamposModal();
}

function removerProduto(indice) {
  produtosDaDevolucao.splice(indice, 1);
  atualizarTelaProdutos();
}

function atualizarTelaProdutos() {
  const containerLista = document.getElementById("lista-produtos-adicionados");

  if (produtosDaDevolucao.length === 0) {
    containerLista.innerHTML =
      "<p style='color: #777; font-size: 14px;'>Nenhum produto adicionado ainda.</p>";
    return;
  }

  containerLista.innerHTML = "";

  produtosDaDevolucao.forEach((item, index) => {
    containerLista.innerHTML += `
      <div class="item-lista-produto">
        <div>
          <strong>${item.quantidade} ${item.unidade}</strong> x ${item.descricao} <br>
          <small style="color: #666;">SKU: ${item.sku} | EAN: ${item.ean}</small>
        </div>
        <button type="button" class="btn-remover" onclick="removerProduto(${index})">Remover</button>
      </div>
    `;
  });
}

function verificarOutroMotivo() {
  const selectMotivo = document.getElementById("motivodevolucao");
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

let formularioAlterado = false;

window.addEventListener("beforeunload", (evento) => {
  if (formularioAlterado) {
    evento.preventDefault();
  }
});

function reiniciarTela() {
  if (formularioAlterado) {
    const confirmar = confirm(
      "Tem certeza que deseja limpar todos os campos e reiniciar a tela? Os dados não salvos serão perdidos."
    );
    if (!confirmar) return;
  }

  document.getElementById("formDevolucao").reset();
  verificarOutroMotivo();
  alterarModalidadeSolicitacao();
  alternarCompraInteira();
  alternarEntregueEmLoja();

  if (typeof preencherDadosUsuarioLogado === "function") {
    preencherDadosUsuarioLogado({ somenteSeVazio: false });
  }

  document.getElementById("cpfcliente").setCustomValidity("");
  document.getElementById("telefonecliente").setCustomValidity("");
  document.getElementById("cepcliente").setCustomValidity("");

  produtosDaDevolucao = [];
  atualizarTelaProdutos();

  formularioAlterado = false;
  inicializarDadosAutomaticos();
}

document.addEventListener("DOMContentLoaded", () => {
  const elVersao = document.getElementById("versao-sistema");
  if (elVersao && typeof VERSAO_PORTAL !== "undefined") {
    elVersao.textContent = `Versão ${VERSAO_PORTAL}`;
  }

  if (typeof preencherDadosUsuarioLogado === "function") {
    preencherDadosUsuarioLogado({ somenteSeVazio: false });
  }

  inicializarDadosAutomaticos();

  const form = document.getElementById("formDevolucao");

  form.addEventListener("input", () => {
    formularioAlterado = true;
  });

  form.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    if (!document.getElementById("protocolo").value) {
      await inicializarDadosAutomaticos();
    }

    const compraInteira = document.getElementById("comprainteira").checked;

    if (!compraInteira && produtosDaDevolucao.length === 0) {
      alert(
        "É obrigatório adicionar pelo menos 1 produto ou marcar a opção 'Compra Inteira'!"
      );
      abrirModalProduto();
      return;
    }

    const tipoSolicitacao = document.getElementById("tiposolicitacao").value;
    const textoTipo = tipoSolicitacao === "TRC" ? "Troca" : "Devolução";
    const entregueEmLoja = document.getElementById("entregueemloja").checked;

    const botaoSalvar = document.getElementById("btn-registrar-principal");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Registrando na Planilha...";

    const protocolo = document.getElementById("protocolo").value;
    const numeroPedido = document
      .getElementById("numeropedido")
      .value.trim()
      .replace(/^#+/, "");

    const motivoSelecionado = document.getElementById("motivodevolucao").value;
    const motivoFinal =
      motivoSelecionado === "Outros"
        ? `Outros: ${document.getElementById("outromotivo").value.trim()}`
        : motivoSelecionado;

    const novaSolicitacao = {
      id: document.getElementById("idsolicitacao").value,
      protocolo: protocolo,
      tipo: tipoSolicitacao,
      status: "Em andamento",
      whatsappEnviado: false,
      entregueEmLoja: entregueEmLoja,
      compraInteira: compraInteira,
      dataSolicitacao: document.getElementById("datasolicitacao").value,
      loja: document.getElementById("loja").value,
      solicitante: document.getElementById("solicitante").value.trim(),
      numeroPedido: numeroPedido,
      motivo: motivoFinal,
      observacao: document.getElementById("observacao").value.trim(),
      cliente: {
        nome: document.getElementById("nomecliente").value.trim(),
        cpf: document.getElementById("cpfcliente").value.trim(),
        telefone: document.getElementById("telefonecliente").value.trim(),
      },
      endereco: entregueEmLoja
        ? {
            rua: "ENTREGUE EM LOJA",
            cep: "",
            numero: "",
            bairro: "",
            cidade: "",
            estado: "",
            complemento: "",
          }
        : {
            rua: document.getElementById("ruacliente").value.trim(),
            cep: document.getElementById("cepcliente").value.trim(),
            numero: document.getElementById("numerocliente").value.trim(),
            bairro: document.getElementById("bairrocliente").value.trim(),
            cidade: document.getElementById("cidadecliente").value.trim(),
            estado: document.getElementById("estadocliente").value.trim(),
            complemento: document.getElementById("complementocliente").value.trim(),
          },
      produtos: compraInteira ? [] : [...produtosDaDevolucao],
    };

    try {
      const resposta = await fetch(URL_API_PLANILHA, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          acao: "criar",
          dados: novaSolicitacao,
        }),
      });

      const textoResposta = await resposta.text();
      let resultado;
      try {
        resultado = JSON.parse(textoResposta);
      } catch (e) {
        throw new Error("Resposta inválida do Apps Script: " + textoResposta);
      }

      if (resultado.sucesso) {
        novaSolicitacao.id = resultado.idOficial;
        novaSolicitacao.protocolo = resultado.protocoloOficial;

        if (tipoSolicitacao === "TRC") {
          contadoresPlanilha.TRC += 1;
          localStorage.setItem("contador_troca", contadoresPlanilha.TRC);
        } else {
          contadoresPlanilha.DEV += 1;
          localStorage.setItem("contador_devolucao", contadoresPlanilha.DEV);
        }

        alert(
          `${textoTipo} ${resultado.protocoloOficial} registrada com sucesso na planilha!\n\nA comunicação via WhatsApp já está disponível na tela inicial.`
        );

        formularioAlterado = false;
        reiniciarTela();
      } else {
        alert("A planilha retornou um erro ao salvar: " + resultado.erro);
      }
    } catch (erro) {
      console.error("Erro detalhado ao salvar:", erro);
      alert(
        "Não foi possível salvar na planilha.\nDetalhe técnico: " + erro.message
      );
    } finally {
      botaoSalvar.disabled = false;
      alterarModalidadeSolicitacao();
    }
  });
});