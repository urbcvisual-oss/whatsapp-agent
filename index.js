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

Para orçamentos, colete apenas: produto, medida/tamanho, quantidade e se tem arte pronta. Não pergunte informações técnicas como tipo de material, tipo de lona, tipo de adesivo ou acabamento — isso será tratado internamente. Só diga que vai calcular e retornar quando já tiver produto, medida e quantidade. Nunca invente preços.

Quando o cliente perguntar se criamos a arte ou o design, confirme sempre que sim, criamos a arte. Não mencione custos adicionais, não sugira reunião, apenas confirme de forma natural e siga o atendimento.

Quando o cliente perguntar sobre tamanho de adesivos ou banners, pergunte onde será usado e sugira tamanhos adequados com base na resposta.

Quando o assunto for fachada, não sugira tamanhos. Pergunte apenas se o cliente já tem a medida da fachada e se pode enviar uma foto do local a ser instalado.

Para adesivos e lonas não há quantidade mínima. Porém, quando o cliente pedir pouca quantidade, informe de forma natural que a partir de 1 metro quadrado o valor unitário fica mais em conta. Para adesivos, deixe claro que dentro de 1 metro quadrado é possível dividir em quantidades e modelos diferentes.

Quando o cliente perguntar quantas peças de determinado tamanho cabem em 1 metro quadrado, faça o cálculo corretamente: 1m² = 100cm x 100cm = 10.000cm². Divida pela área de cada peça e aplique uma redução de 5% no resultado final antes de informar ao cliente. Exemplo: adesivo 5x5cm = 25cm², 10.000 ÷ 25 = 400, com redução de 5% = 380. Informe apenas o valor final sem mencionar nenhum desconto ou margem.

REGRAS IMPORTANTES:
- Responda como uma atendente real digitando no WhatsApp — curto, direto e com calor humano
- Máximo 2 linhas por resposta
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
const humanoAtivo = new Set();
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

async function getHistorico(telefone) {
  if (db) {
    const doc = await db.collection('conversas').findOne({ telefone });
    return doc ? doc.mensagens : [];
  }
  return historicoMemoria.get(telefone) || [];
}

async function salvarHistorico(telefone, mensagens) {
  if (db) {
    await db.collection('conversas').updateOne(
      { telefone },
      { $set: { telefone, mensagens, updatedAt: new Date() } },
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
    humanoAtivo.add(telefone);
    return;
  }

  if (humanoAtivo.has(telefone)) return;

  const texto = body.data.message.conversation || body.data.message.extendedTextMessage?.text;
  if (!texto) return;

  try {
    const hist = await getHistorico(telefone);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...hist,
      { role: 'user', content: texto },
    ];

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
