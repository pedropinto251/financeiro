import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

const IMOVIRTUAL_URL =
  'https://www.imovirtual.com/_next/data/DgbmbX0jiylTfZDI15F3j/pt/resultados/comprar/apartamento/aveiro/espinho.json?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC&searchingCriteria=comprar&searchingCriteria=apartamento&searchingCriteria=aveiro&searchingCriteria=espinho&page=1';
const SUPERCASA_URL = 'https://supercasa.pt/comprar-casas/espinho/espinho/pagina-1';

const ROOM_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
};

type Listing = {
  id: string;
  source: 'imovirtual' | 'supercasa';
  title: string;
  price?: string;
  area?: string;
  rooms?: string;
  image?: string;
  url?: string;
};

const decodeHtml = (input: string) => {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code.startsWith('#x')) {
      const num = parseInt(code.slice(2), 16);
      return Number.isFinite(num) ? String.fromCharCode(num) : match;
    }
    if (code.startsWith('#')) {
      const num = parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCharCode(num) : match;
    }
    const map: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
    return map[code] ?? match;
  });
};

const cleanText = (input: string) => decodeHtml(input).replace(/\s+/g, ' ').trim();

const parseImovirtual = (payload: any): Listing[] => {
  const items = payload?.pageProps?.data?.searchAds?.items ?? [];
  return items.map((item: any) => {
    const rawHref = typeof item.href === 'string' ? item.href : '';
    const href = rawHref.replace('[lang]', 'pt');
    const url = href
      ? href.startsWith('http')
        ? href
        : `https://www.imovirtual.com/${href.replace(/^\/?/, '')}`
      : undefined;
    const priceValue = item?.totalPrice?.value;
    const priceCurrency = item?.totalPrice?.currency;
    const price = priceValue ? `${priceValue} ${priceCurrency || 'EUR'}` : 'Preço sob consulta';
    const area = item?.areaInSquareMeters ? `${item.areaInSquareMeters} m²` : undefined;
    const roomsNumber = item?.roomsNumber;
    const rooms = roomsNumber
      ? `${ROOM_MAP[roomsNumber] ?? roomsNumber} quartos`
      : undefined;
    const image = item?.images?.[0]?.medium || item?.images?.[0]?.large || undefined;

    return {
      id: String(item.id),
      source: 'imovirtual',
      title: item.title || 'Imóvel',
      price,
      area,
      rooms,
      image,
      url,
    };
  });
};

const parseSupercasa = (html: string): Listing[] => {
  const propertyBlocks: string[] = [];
  const idRegex = /id="property_(\d+)"/g;
  const matches = [...html.matchAll(idRegex)];
  if (!matches.length) return [];

  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? html.length : html.length;
    propertyBlocks.push(html.slice(start, end));
  }

  return propertyBlocks.map((block) => {
    const idMatch = block.match(/id="property_(\d+)"/);
    const id = idMatch ? idMatch[1] : '0';

    const titleMatch = block.match(/<h2 class="property-list-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? cleanText(titleMatch[1]) : 'Imóvel';

    const urlMatch = block.match(/<h2 class="property-list-title">[\s\S]*?<a href="([^"]+)"/);
    const url = urlMatch ? `https://supercasa.pt${urlMatch[1]}` : undefined;

    const priceMatch = block.match(/<div class="property-price">[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const price = priceMatch ? cleanText(priceMatch[1]) : undefined;

    const imgMatch = block.match(/background-image:\s*url\(([^)]+)\)/);
    const image = imgMatch ? imgMatch[1].replace(/['"]/g, '') : undefined;

    const featuresMatch = block.match(/<div class="property-features">([\s\S]*?)<\/div>/);
    const featureText = featuresMatch
      ? [...featuresMatch[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]))
      : [];

    const rooms = featureText.find((text) => text.toLowerCase().includes('quarto'));
    const area = featureText.find((text) => text.toLowerCase().includes('m²'));

    return {
      id,
      source: 'supercasa',
      title,
      price,
      area,
      rooms,
      image,
      url,
    };
  });
};

export default function RealEstateAggregatorScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imovirtual, setImovirtual] = useState<Listing[]>([]);
  const [supercasa, setSupercasa] = useState<Listing[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [imovirtualRes, supercasaRes] = await Promise.all([
        fetch(IMOVIRTUAL_URL, { headers: { accept: 'application/json' } }),
        fetch(SUPERCASA_URL, { headers: { accept: 'text/html' } }),
      ]);

      if (!imovirtualRes.ok) throw new Error('Imovirtual indisponível');
      if (!supercasaRes.ok) throw new Error('Supercasa indisponível');

      const imovirtualJson = await imovirtualRes.json();
      const supercasaHtml = await supercasaRes.text();

      setImovirtual(parseImovirtual(imovirtualJson));
      setSupercasa(parseSupercasa(supercasaHtml));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => imovirtual.length + supercasa.length, [imovirtual, supercasa]);

  const handleOpen = async (url?: string) => {
    if (!url) return;
    await Linking.openURL(url);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            try {
              setRefreshing(true);
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <ThemedView style={styles.header}>
        <IconSymbol size={28} name="building.2.fill" color="#2F62D0" />
        <ThemedText type="title" style={{ fontFamily: Fonts.rounded }}>
          Agregador de Imóveis
        </ThemedText>
      </ThemedView>
      <ThemedText style={styles.subtitle}>
        Teste rápido com Imovirtual e Supercasa. Total carregado: {total}
      </ThemedText>
      <ThemedText style={styles.note}>
        Nota: o link do Imovirtual usa um buildId ("DgbmbX0jiylTfZDI15F3j"). Se deixar de funcionar,
        é só atualizar o URL.
      </ThemedText>

      {loading ? (
        <ThemedText style={styles.status}>A carregar…</ThemedText>
      ) : error ? (
        <ThemedText style={styles.error}>Erro: {error}</ThemedText>
      ) : null}

      <Section title={`Imovirtual (${imovirtual.length})`} />
      {imovirtual.map((item) => (
        <ListingCard key={`imovirtual-${item.id}`} item={item} onOpen={handleOpen} />
      ))}

      <Section title={`Supercasa (${supercasa.length})`} />
      {supercasa.map((item) => (
        <ListingCard key={`supercasa-${item.id}`} item={item} onOpen={handleOpen} />
      ))}
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
      {title}
    </ThemedText>
  );
}

function ListingCard({ item, onOpen }: { item: Listing; onOpen: (url?: string) => void }) {
  return (
    <ThemedView style={styles.card}>
      <View style={styles.cardRow}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.placeholder]} />
        )}
        <View style={styles.cardBody}>
          <ThemedText type="defaultSemiBold" numberOfLines={2}>
            {item.title}
          </ThemedText>
          {item.price ? <ThemedText style={styles.meta}>{item.price}</ThemedText> : null}
          {item.rooms ? <ThemedText style={styles.meta}>{item.rooms}</ThemedText> : null}
          {item.area ? <ThemedText style={styles.meta}>{item.area}</ThemedText> : null}
        </View>
      </View>
      {item.url ? (
        <TouchableOpacity onPress={() => onOpen(item.url)} style={styles.linkBtn}>
          <ThemedText style={styles.linkText}>Abrir anúncio</ThemedText>
        </TouchableOpacity>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    marginTop: 18,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subtitle: {
    marginBottom: 6,
  },
  note: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 12,
  },
  status: {
    marginBottom: 12,
  },
  error: {
    marginBottom: 12,
    color: '#C0392B',
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardBody: {
    flex: 1,
  },
  meta: {
    fontSize: 12,
    opacity: 0.8,
  },
  thumbnail: {
    width: 96,
    height: 72,
    borderRadius: 10,
  },
  placeholder: {
    backgroundColor: '#E2E2E2',
  },
  linkBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2F62D0',
  },
  linkText: {
    color: '#2F62D0',
    fontSize: 12,
  },
});
