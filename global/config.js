const VERSAO_PORTAL = "v3.1.7";

// Cole entre as aspas a URL do seu App da Web gerada no Google Apps Script
const URL_API_PLANILHA = "https://script.google.com/macros/s/AKfycbybrz57VLod4huOF5dyo09YfAEQW_JWMYPTAgGhlTO6hyCmTTzbNts2Wd8FUyRiHFNZcA/exec";

const USUARIOS_PREDEFINIDOS = [
  {
    id: "kellen-pires",
    nome: "Kellen Pires",
    cargo: "Encarregada",
    lojas: ["Loja 8 - Vila Isa"],
    rotulo: "Kellen Pires — Encarregada (Loja 8)",
  },
  {
    id: "henrique-freitas",
    nome: "Henrique Freitas",
    cargo: "Encarregado",
    lojas: ["Loja 9 - São Pedro"],
    rotulo: "Henrique Freitas — Encarregado (Loja 9)",
  },
  {
    id: "guilherme-paixao",
    nome: "Guilherme Paixão",
    cargo: "Orientador Técnico",
    lojas: ["Loja 9 - São Pedro"],
    rotulo: "Guilherme Paixão — Orientador Técnico (Loja 9)",
  },
  {
    id: "phillip-abreu",
    nome: "Phillip Abreu",
    cargo: "Gerente",
    lojas: ["Loja 8 - Vila Isa", "Loja 9 - São Pedro"],
    rotulo: "Phillip Abreu — Gerente (Lojas 8 e 9)",
  },
];