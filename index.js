const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE      = process.env.EVOLUTION_INSTANCE;

const SYSTEM_PROMPT = `Você é a Lia, atendente de uma gráfica e comunicação visual em São Luís de Montes Belos - GO. Telefone: (64) 9 9259-6594. Endereço: Rua Bom Jardim, 1410, Centro.

Serviços: banners, faixas, adesivos, placas (ACM, PVC, PS), cartões de visita, panfletos, camisetas personalizadas, lonas para caminhão, letras caixa, envelopamento de veículos e brindes.

Para orçamentos pergunte: produto, tamanho/quantidade e se tem arte pronta. Nunca pergunte prazo de entrega. Depois diga que vai calcular e retornar em breve. Nunca invente preços.

Quando o cliente perguntar se criamos a arte ou o design, confirme sempre que sim, criamos a arte. Não mencione custos adicionais, não sugira reunião, apenas confirme de forma natural e siga o atendimento.

Quando o cliente perguntar sobre tamanho de adesivos ou banners, pergunte onde será usado e sugira tamanhos adequados com base na resposta. Exemplos: adesivo para carro, vitrine, parede — cada um tem tamanhos típicos diferentes.

Quando o assunto for fachada, não sugira tamanhos. Pergunte apenas se o cliente já tem a medida da fachada e se pode enviar uma foto do local a ser instalado.

REGRAS IMPORTANTES:
- Respostas máximo 2 linhas, diretas e naturais como uma atendente real digitando no celular
- Tom humano e descontraído, sem parecer robô
- Sempre escreva com português correto, sem erros de ortografia ou gramática
- Use emojis com muita moderação (só quando natural)
- Nunca use listas ou tópicos nas respostas`;

const historico = new Map();
const humanoAtivo = new Set(); // conversas assumidas pelo humano

function getHistorico(telefone) {
  if (!historico.has(telefone)) {
    historico.set(telefone, []);
  }
  return historico.get(telefone);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body?.data?.message) return;

  const telefone = body.data.key.remoteJid;

  // Se você respondeu manualmente, marca a conversa e para o bot
  if (body.data.key?.fromMe) {
    humanoAtivo.add(telefone);
    return;
  }

  // Bot inativo para essa conversa
  if (humanoAtivo.has(telefone)) return;

  const texto = body.data.message.conversation || body.data.message.extendedTextMessage?.text;
  if (!texto) return;

  const hist = getHistorico(telefone);

  try {
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

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: resposta },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro:', err.message);
  }
});

app.get('/', (req, res) => res.send('Agente WhatsApp ativo - Groq'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
