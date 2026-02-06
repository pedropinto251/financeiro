const net = require('net');
const tls = require('tls');
const { URL } = require('url');

function getConfig() {
  const host = process.env.TG_SMS_HOST;
  const user = process.env.TG_SMS_USER;
  const pass = process.env.TG_SMS_PASS;
  const protocol = process.env.TG_SMS_PROTOCOL === 'https' ? 'https' : 'http';
  const port = process.env.TG_SMS_PORT ? Number(process.env.TG_SMS_PORT) : protocol === 'https' ? 443 : 80;
  const rejectUnauthorized = process.env.TG_SMS_REJECT_UNAUTHORIZED === 'false' ? false : true;

  if (!host || !user || !pass) {
    throw new Error('Configuração Yeastar SMS em falta (TG_SMS_HOST, TG_SMS_USER, TG_SMS_PASS).');
  }

  return { host, user, pass, protocol, port, rejectUnauthorized };
}

function fireAndForgetRequest({ host, port, protocol, path, rejectUnauthorized }) {
  return new Promise((resolve, reject) => {
    const client =
      protocol === 'https'
        ? tls.connect(
            {
              host,
              port,
              rejectUnauthorized,
            },
            () => send()
          )
        : net.connect({ host, port }, () => send());

    function send() {
      const req = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
      client.write(req);
    }

    client.setTimeout(15000, () => {
      client.destroy();
      reject(new Error('Timeout a enviar SMS via Yeastar'));
    });

    client.on('error', reject);
    client.on('close', () => resolve());
  });
}

async function sendSmsYeastar({ numbers, message }) {
  const { host, user, pass, protocol, port, rejectUnauthorized } = getConfig();

  for (const numRaw of numbers) {
    const num = numRaw.replace(/[^\d+]/g, '');
    const url = new URL(`${protocol}://${host}:${port}/cgi/WebCGI`);
    url.searchParams.set('type', 'sms');
    url.searchParams.set('action', 'send');
    url.searchParams.set('to', num);
    url.searchParams.set('text', message);
    url.searchParams.set('user', user);
    url.searchParams.set('pass', pass);

    // Usa TCP directo e ignora parsing de headers para contornar respostas inválidas
    await fireAndForgetRequest({
      host,
      port,
      protocol,
      path: url.pathname + url.search,
      rejectUnauthorized,
    });
  }
}

module.exports = { sendSmsYeastar };
