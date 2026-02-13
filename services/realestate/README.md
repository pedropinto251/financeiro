# Real Estate Aggregator

Estrutura modular do agregador de imoveis.

## Estrutura
- `index.js`: orquestra os providers e agrega resultados.
- `utils.js`: helpers comuns (texto, slugify, merge/dedupe).
- `browserless.js`: helper para usar Browserless quando bloqueado.
- `providers/`: um ficheiro por fonte.

## Providers
- `imovirtual.js`
- `supercasa.js`
- `casacerta.js`
- `casayes.js`
- `greenacres.js`

## Contrato de retorno
Cada provider devolve:
- `items`: array de anuncios normalizados
- `warnings`: array de avisos
- `method`: `fetch` | `browserless` | `browserless_empty` | `blocked`

`index.js` agrega tudo e devolve:
```
{ imovirtual, supercasa, casacerta, casayes, greenacres, combined, warnings, methods, page, district, council }
```

## Notas
- Browserless so e usado quando o fetch normal falha/esta bloqueado.
- O merge (dedupe) usa titulo normalizado + buckets de preco/area + distrito/concelho.
