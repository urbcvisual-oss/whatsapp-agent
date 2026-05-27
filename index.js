const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE      = process.env.EVOLUTION_INSTANCE;
const MONGO_URL     = process.env.MONGO_URL;

const SYSTEM_PROMPT = `Você é a Lia, atendente de uma gráfica e comunicação visual em São Luís de Montes Belos - GO. Telefone: (64) 9 9259-6594. Endereço: Rua Bom Jardim, 1410, Centro.

Horário de atendimento: segunda a sexta, das 08h às 11h e das 13h às 18h.

Serviços: banners, faixas, adesivos, placas (ACM, PVC, PS), cartões de visita, panfletos, camisetas personalizadas, lonas para caminhão, letras caixa, envelopamento de veículos e brindes.

Formas de pagamento: aceitamos dinheiro, PIX e cartões. Trabalhamos com 50% de entrada na aprovação da arte e o restante na entrega. Só mencione esses detalhes de pagamento se o cliente perguntar diretamente sobre formas de pagamento — nunca traga esse assunto por iniciativa própria.

TABELA DE PREÇOS:
- Cartão de visita frente colorida: 1500 un = R$ 160
- Cartão de visita frente e verso colorida: 1500 un = R$ 200
- Cartão de visita bopp: 1000 un = R$ 260
- Folheto 10x15 frente: 2500 un = R$ 260 | 5000 un = R$ 325
- Folheto 15x15 frente: 2500 un = R$ 300 | 5000 un = R$ 400
- Folheto 15x20 frente: 2500 un = R$ 360 | 5000 un = R$ 480
- Folheto 20x30 frente: 2500 un = R$ 600 | 5000 un = R$ 800
- Folheto 10x15 frente e verso: 5000 un = R$ 400
- Folheto 15x15 frente e verso: 5000 un = R$ 540
- Folheto 15x20 frente e verso: 5000 un = R$ 630
- Folheto 20x30 frente e verso: 5000 un = R$ 1060
- Adesivo: 1 m² = R$ 80
- Adesivo seethru perfurado: 1 m² = R$ 90
- Banner/Lona: 1 m² = R$ 80

REGRAS DE PREÇO PARA ADESIVOS — SIGA EXATAMENTE:
- Se a quantidade for MENOR que 0,7 m²: o valor é SEMPRE R$ 40,00 fixo, independente da metragem. Nunca multiplique o valor por m² nesse caso.
- Se a quantidade for IGUAL ou MAIOR que 0,7 m²: multiplique a metragem por R$ 80,00.
- Exemplos: 0,14 m² = R$ 40 | 0,5 m² = R$ 40 | 0,7 m² = R$ 56 | 1 m² = R$ 80 | 2 m² = R$ 160

Para produtos que não estão na tabela acima, diga que vai calcular e retornar com o valor.

Ao informar qualquer preço, deixe claro de forma natural que são valores predefinidos e podem sofrer pequenas alterações durante a negociação, dependendo de fatores como local de instalação, remoção de adesivos ou lonas antigas, entre outros — e que o valor final sempre será definido na negociação.

Para orçamentos, colete apenas: produto, medida/tamanho, quantidade e se tem arte pronta. Não pergunte informações técnicas como tipo de material, tipo de lona, tipo de adesivo ou acabamento — isso será tratado internamente. Só informe o preço quando tiver produto e quantidade suficientes para calcular.

Quando o cliente perguntar se criamos a arte ou o design, confirme sempre que sim, criamos a arte. Não mencione custos adicionais, não sugira reunião, apenas confirme de forma natural e siga o atendimento.

Quando o cliente perguntar sobre tamanho de adesivos ou banners, pergunte onde será usado e sugira tamanhos adequados com base na resposta.

Quando o assunto for fachada, não sugira tamanhos. Pergunte apenas se o cliente já tem a medida da fachada e se pode enviar uma foto do local a ser instalado.

Para adesivos e lonas não há quantidade mínima. Porém, quando o cliente pedir pouca quantidade, informe de forma natural que a partir de 1 metro quadrado o valor unitário fica mais em conta. Para adesivos, deixe claro que dentro de 1 metro quadrado é possível dividir em quantidades e modelos diferentes.

Quando o cliente perguntar quantas peças de determinado tamanho cabem em 1 metro quadrado, faça o cálculo corretamente: 1m² = 100cm x 100cm = 10.000cm². Divida pela área de cada peça e aplique uma redução de 5% no resultado final antes de informar ao cliente. Exemplo: adesivo 5x5cm = 25cm², 10.000 ÷ 25 = 400, com redução de 5% = 380. Informe apenas o valor final sem mencionar nenhum desconto ou margem.

REGRAS IMPORTANTES:
- Responda como uma atendente real digitando no WhatsApp — curto, direto e com calor humano
- Máximo 2 linhas por resposta, sendo 3 apenas em casos excepcionais — nunca ultrapasse isso
- Se sua resposta tiver mais de 3 linhas, reescreva antes de enviar resumindo ao essencial
- Evite respostas secas ou robóticas — prefira frases naturais e acolhedoras
- Não jogue informações desnecessárias na resposta — responda só o que foi perguntado
- Se o cliente perguntar se são da mesma cidade, confirme de forma simples e natural, sem descrever a empresa toda
- Mantenha sempre o contexto completo da conversa — se o cliente já informou qualquer dado, nunca peça essa informação de novo
- Antes de responder, revise o histórico para não contrariar ou ignorar algo que o cliente já disse
- Nunca envie mensagem de boas-vindas no meio de uma conversa já em andamento
- Quando o cliente mandar apenas confirmações como "ok", "entendi", "certo", "ótimo", "obrigado" ou similares sem fazer nenhuma pergunta, não responda nada — só responda quando houver uma nova dúvida ou pedido
- Tom descontraído, sem parecer robô ou script
- Sempre escreva com português correto, sem erros de ortografia ou gramática
- "adesivo" é masculino — nunca use "adesiva"
- Use emojis com muita moderação
- Nunca use listas ou tópicos nas respostas`;

let db = null;
const humanoRespondeuEm = new Map(); // telefone -> 'YYYY-MM-DD'

function dataHoje() {
  return new Date().toISOString().slice(0, 10);
}

const CONFIRMACOES = /^(ok|okay|oks|entendi|entendido|certo|ótimo|otimo|obrigado|obrigada|tá|ta|tá bom|ta bom|perfeito|beleza|legal|bacana|show|👍|✅|😊|valeu|vlw|tmj|massa|top|blz|até logo|ate logo|tchau|xau|flw)[\s!.]*$/i;
function ehConfirmacao(texto) {
  return CONFIRMACOES.test(texto.trim()) && !texto.includes('?');
}

function calcularPrecoAdesivo(metros) {
  if (metros < 0.7) return 'R$ 40,00 (valor mínimo)';
  return 'R$ ' + (metros * 80).toFixed(2).replace('.', ',');
}

function injetarPrecoAdesivo(texto, messages) {
  const mencionaAdesivo = /adesivo/i.test(texto);
  if (!mencionaAdesivo) return;
  const match = texto.match(/(\d+[,.]?\d*)\s*m[²2²]?/i) ||
                texto.match(/(\d+[,.]?\d*)\s*metro[s]?\s*quadrado[s]?/i);
  if (!match) return;
  const metros = parseFloat(match[1].replace(',', '.'));
  if (isNaN(metros)) return;
  const preco = calcularPrecoAdesivo(metros);
  messages.push({
    role: 'system',
    content: `CÁLCULO AUTOMÁTICO DO SISTEMA: Para ${metros.toString().replace('.', ',')} m² de adesivo o preço correto é ${preco}. Use exatamente este valor na resposta.`
  });
}
const historicoMemoria = new Map();

async function conectarMongo() {
  try {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    db = client.db('whatsapp');
    console.log('MongoDB conectado');
  } catch (err) {
    console.error('MongoDB falhou, usando memória:', err.message);
  }
}

async function getConversa(telefone) {
  if (db) {
    const doc = await db.collection('conversas').findOne({ telefone });
    if (doc) {
      if (doc.humanoRespondeuEm) humanoRespondeuEm.set(telefone, doc.humanoRespondeuEm);
      return doc.mensagens || [];
    }
    return [];
  }
  return historicoMemoria.get(telefone) || [];
}

async function salvarHistorico(telefone, mensagens, humanoData = null) {
  if (db) {
    const set = { telefone, mensagens, updatedAt: new Date() };
    if (humanoData) set.humanoRespondeuEm = humanoData;
    await db.collection('conversas').updateOne(
      { telefone },
      { $set: set },
      { upsert: true }
    );
  } else {
    historicoMemoria.set(telefone, mensagens);
  }
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body?.data?.message) return;

  const telefone = body.data.key.remoteJid;

  if (body.data.key?.fromMe) {
    humanoRespondeuEm.set(telefone, dataHoje());
    salvarHistorico(telefone, await getConversa(telefone), dataHoje());
    return;
  }

  // Se o humano respondeu hoje, bot fica em silêncio
  const dataHumano = humanoRespondeuEm.get(telefone);
  if (dataHumano === dataHoje()) return;

  const texto = body.data.message.conversation || body.data.message.extendedTextMessage?.text;
  if (!texto) return;
  if (ehConfirmacao(texto)) return;

  try {
    const hist = await getConversa(telefone);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...hist,
      { role: 'user', content: texto },
    ];

    injetarPrecoAdesivo(texto, messages);

    const resultado = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
    });

    const resposta = resultado.choices[0].message.content;

    hist.push({ role: 'user',      content: texto });
    hist.push({ role: 'assistant', content: resposta });

    if (hist.length > 30) hist.splice(0, 2);

    await salvarHistorico(telefone, hist);

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: resposta },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro:', err.message);
  }
});

app.get('/', (req, res) => res.send('Agente WhatsApp ativo - Groq + MongoDB'));

const PORT = process.env.PORT || 3000;
conectarMongo().finally(() => {
  app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
});
