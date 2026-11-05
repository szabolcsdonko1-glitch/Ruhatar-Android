
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  FlatList, Alert, StyleSheet, SafeAreaView,
  ActivityIndicator, Image, RefreshControl
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from './supabase';
import LoginScreen from './LoginScreen';

const C = {
  green: '#126447',
  dark: '#103e30',
  light: '#e9f4ed',
  bg: '#f6f8f6',
  white: '#ffffff',
  gray: '#66756e',
  border: '#e0e8e2',
  red: '#b23c36',
  gold: '#e6f2dc'
};

const blank = {
  nev: '', meret: '', marka: '', szin: '',
  kategoria: '', hely: '', eladasi_ar: '',
  beszerzesi_ar: '', darabszam: '1',
  megjegyzes: ''
};

const money = n =>
  Math.round(Number(n) || 0).toLocaleString('hu-HU') + ' Ft';

const number = n => Number(n) || 0;

function Button({ title, onPress, disabled, secondary, danger }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        st.button,
        secondary && st.secondaryButton,
        danger && { backgroundColor: C.red },
        disabled && { opacity: 0.5 }
      ]}
    >
      <Text style={[
        st.buttonText,
        secondary && { color: C.green }
      ]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Input({ label, value, onChangeText, numeric, multiline }) {
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={[st.input, multiline && { height: 85 }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        placeholder={label}
        placeholderTextColor="#98a49d"
      />
    </View>
  );
}

function Tile({ icon, title, value, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={st.tile}
    >
      <Text style={st.tileIcon}>{icon}</Text>
      <Text style={st.tileValue}>{value}</Text>
      <Text style={st.tileTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

function ProductCard({ item, onPress }) {
  return (
    <TouchableOpacity style={st.product} onPress={onPress}>
      <View style={st.productImage}>
        {item.foto_url ? (
          <Image
            source={{ uri: item.foto_url }}
            style={{ width: 66, height: 75, borderRadius: 10 }}
          />
        ) : (
          <Text style={{ fontSize: 34 }}>👕</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.productName} numberOfLines={1}>
          {item.nev}
        </Text>
        <Text style={st.muted}>
          {item.marka || 'Márka nélkül'} • {item.meret || 'Méret nélkül'}
        </Text>
        <Text style={st.muted} numberOfLines={1}>
          {item.kod}
        </Text>
        <Text style={st.price}>{money(item.eladasi_ar)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 7 }}>
        <Text style={[
          st.stock,
          number(item.darabszam) === 0 && st.outStock
        ]}>
          {item.darabszam} db
        </Text>
        <Text style={{ fontSize: 22, color: C.gray }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CloudApp() {
  const [employee, setEmployee] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(blank);
  const [selectedId, setSelectedId] = useState(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const selected = items.find(x => x.id === selectedId);

  const loadData = useCallback(async (showError = true) => {
    setRefreshing(true);
    try {
      const [r, e] = await Promise.all([
        supabase.from('ruhak').select('*')
          .order('letrehozva', { ascending: false }),
        supabase.from('eladasok').select('*')
          .order('eladva', { ascending: false })
          .limit(300)
      ]);
      if (r.error) throw r.error;
      if (e.error) throw e.error;
      setItems(r.data || []);
      setSales(e.data || []);
    } catch (err) {
      if (showError) Alert.alert('Felhőhiba', err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const checkUser = useCallback(async user => {
    try {
      if (!user) {
        setEmployee(null);
        setItems([]);
        setSales([]);
        return;
      }

      const { data, error } = await supabase
        .from('dolgozok')
        .select('id, nev, szerepkor')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        await supabase.auth.signOut();
        setEmployee(null);
        return;
      }

      setEmployee(data);
    } catch (err) {
      Alert.alert('Azonosítási hiba', err.message);
      setEmployee(null);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) checkUser(data?.user);
    }).catch(() => {
      if (active) setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (event === 'SIGNED_OUT') {
          setEmployee(null);
          setItems([]);
          setSales([]);
          setScreen('');
          setTab('home');
        }
        if (event === 'SIGNED_IN' && session?.user) {
          checkUser(session.user);
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [checkUser]);

  useEffect(() => {
    if (employee?.id) loadData();
  }, [employee?.id, loadData]);

  const stats = useMemo(() => {
    const stock = items.reduce(
      (a, x) => a + number(x.darabszam), 0
    );
    const stockValue = items.reduce(
      (a, x) => a + number(x.darabszam) * number(x.eladasi_ar), 0
    );
    const today = new Date().toDateString();
    const todaySales = sales.filter(x =>
      x.eladva && new Date(x.eladva).toDateString() === today
    );
    return {
      stock,
      kinds: items.length,
      low: items.filter(x => number(x.darabszam) <= 2).length,
      stockValue,
      todayCount: todaySales.reduce(
        (a, x) => a + number(x.darabszam), 0
      ),
      todayRevenue: todaySales.reduce(
        (a, x) => a + number(x.osszeg), 0
      ),
      totalRevenue: sales.reduce(
        (a, x) => a + number(x.osszeg), 0
      )
    };
  }, [items, sales]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(x => {
      const text = [
        x.nev, x.kod, x.marka, x.meret,
        x.szin, x.kategoria, x.hely
      ].join(' ').toLowerCase();

      if (q && !text.includes(q)) return false;
      if (filter === 'stock' && number(x.darabszam) < 1) return false;
      if (filter === 'low' && number(x.darabszam) > 2) return false;
      if (filter === 'empty' && number(x.darabszam) !== 0) return false;
      return true;
    });
  }, [items, query, filter]);

  async function saveItem() {
    if (busy) return;

    const nev = form.nev.trim();
    const count = Number(form.darabszam);
    const price = Number(form.eladasi_ar.replace(',', '.'));
    const cost = form.beszerzesi_ar.trim()
      ? Number(form.beszerzesi_ar.replace(',', '.'))
      : null;

    if (!nev || !form.eladasi_ar.trim()) {
      Alert.alert('Hiányzó adat', 'A név és az eladási ár kötelező.');
      return;
    }
    if (
      !Number.isInteger(count) || count < 0 ||
      !Number.isFinite(price) || price < 0 ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0))
    ) {
      Alert.alert('Hibás adat', 'Ellenőrizd az árakat és a darabszámot.');
      return;
    }

    setBusy(true);
    try {
      const kod = 'R-' +
        Date.now().toString(36).toUpperCase() + '-' +
        Math.random().toString(36).slice(2, 9).toUpperCase();

      const { error } = await supabase.from('ruhak').insert({
        kod,
        nev,
        meret: form.meret.trim(),
        marka: form.marka.trim(),
        szin: form.szin.trim(),
        kategoria: form.kategoria.trim(),
        hely: form.hely.trim(),
        eladasi_ar: price,
        beszerzesi_ar: cost,
        darabszam: count,
        megjegyzes: form.megjegyzes.trim()
      });

      if (error) throw error;

      setForm(blank);
      setScreen('');
      setTab('stock');
      await loadData();
      Alert.alert('Sikeres mentés', 'A ruha bekerült a felhőbe.');
    } catch (err) {
      Alert.alert('Mentési hiba', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sellItem(item) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ruha_eladasa', {
        p_ruha_id: item.id,
        p_darabszam: 1,
        p_osszeg: number(item.eladasi_ar)
      });
      if (error) throw error;

      await loadData();
      setScreen('');
      setTab('sales');
      Alert.alert('Eladás rögzítve', 'A készlet 1 darabbal csökkent.');
    } catch (err) {
      Alert.alert('Eladási hiba', err.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmSale(item) {
    Alert.alert(
      'Eladás megerősítése',
      `${item.nev}\n1 db • ${money(item.eladasi_ar)}`,
      [
        { text: 'Mégse', style: 'cancel' },
        { text: 'Eladva', onPress: () => sellItem(item) }
      ]
    );
  }

  async function startScan() {
    const p = await requestPermission();
    if (!p.granted) {
      Alert.alert('Kameraengedély', 'Engedélyezd a kamerát.');
      return;
    }
    setScanLocked(false);
    setScreen('scan');
  }

  async function onScan({ data }) {
    if (scanLocked) return;
    setScanLocked(true);
    let found = items.find(x => x.kod === data);

    if (!found) {
      const { data: result, error } = await supabase
        .from('ruhak').select('*').eq('kod', data).maybeSingle();
      if (error) {
        Alert.alert('Hiba', error.message);
        setScreen('');
        return;
      }
      found = result;
    }

    if (found) {
      setSelectedId(found.id);
      setScreen('detail');
      if (!items.some(x => x.id === found.id)) await loadData();
    } else {
      Alert.alert('Nem található', 'A kódhoz nincs ruha a készletben.');
      setScreen('');
    }
  }

  function openItem(item) {
    setSelectedId(item.id);
    setScreen('detail');
  }

  function goTo(next) {
    setScreen('');
    setTab(next);
    if (next === 'sales' || next === 'stats') loadData(false);
  }

  const isOwner = employee?.szerepkor === 'tulajdonos';

  if (initializing) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={st.muted}>Ruhatár betöltése...</Text>
      </View>
    );
  }

  if (!employee) {
    return (
      <LoginScreen onLogin={async () => {
        setInitializing(true);
        const { data } = await supabase.auth.getUser();
        await checkUser(data?.user);
      }} />
    );
  }

  if (screen === 'scan') {
    return (
      <SafeAreaView style={st.page}>
        <Text style={st.heading}>QR-kód beolvasása</Text>
        <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanLocked ? undefined : onScan}
          />
        </View>
        <Button title="Vissza" secondary onPress={() => setScreen('')} />
      </SafeAreaView>
    );
  }

  if (screen === 'add') {
    return (
      <SafeAreaView style={st.page}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={st.heading}>Új ruha hozzáadása</Text>
          <Text style={st.muted}>
            A mentett ruha minden jogosult telefonon megjelenik.
          </Text>

          <View style={[st.panel, { marginTop: 16 }]}>
            {[
              ['nev', 'Ruha neve *'],
              ['kategoria', 'Kategória'],
              ['marka', 'Márka'],
              ['meret', 'Méret'],
              ['szin', 'Szín'],
              ['hely', 'Raktári hely'],
              ['eladasi_ar', 'Eladási ár (Ft) *'],
              ['beszerzesi_ar', 'Beszerzési ár (Ft)'],
              ['darabszam', 'Darabszám'],
              ['megjegyzes', 'Megjegyzés']
            ].map(([key, label]) => (
              <Input
                key={key}
                label={label}
                value={form[key]}
                numeric={[
                  'eladasi_ar', 'beszerzesi_ar', 'darabszam'
                ].includes(key)}
                multiline={key === 'megjegyzes'}
                onChangeText={v =>
                  setForm(old => ({ ...old, [key]: v }))
                }
              />
            ))}
            <Button
              title={busy ? 'Mentés folyamatban...' : '✓ Mentés a felhőbe'}
              disabled={busy}
              onPress={saveItem}
            />
            <Button title="Mégse" secondary onPress={() => setScreen('')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'detail') {
    if (!selected) {
      return (
        <SafeAreaView style={st.page}>
          <Text style={st.heading}>Ruha nem található</Text>
          <Button title="Vissza" onPress={() => setScreen('')} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={st.page}>
        <ScrollView>
          <Text style={st.heading}>{selected.nev}</Text>
          <Text style={st.muted}>{selected.kod}</Text>

          {selected.foto_url ? (
            <Image
              source={{ uri: selected.foto_url }}
              style={st.detailPhoto}
              resizeMode="contain"
            />
          ) : null}

          <View style={st.qrPanel}>
            <QRCode value={selected.kod} size={210} />
            <Text style={st.code}>{selected.kod}</Text>
          </View>

          <View style={st.panel}>
            {[
              ['Márka', selected.marka],
              ['Kategória', selected.kategoria],
              ['Méret', selected.meret],
              ['Szín', selected.szin],
              ['Raktári hely', selected.hely],
              ['Készleten', `${selected.darabszam} db`],
              ['Eladási ár', money(selected.eladasi_ar)],
              ['Megjegyzés', selected.megjegyzes]
            ].map(([key, val]) => (
              <View key={key} style={st.detailRow}>
                <Text style={st.muted}>{key}</Text>
                <Text style={st.detailValue}>{val || '-'}</Text>
              </View>
            ))}
          </View>

          <Button
            title={busy ? 'Feldolgozás...' : '🛒 1 db eladása'}
            onPress={() => confirmSale(selected)}
            disabled={busy || number(selected.darabszam) < 1}
          />
          <Button
            title="Készlet frissítése"
            secondary
            onPress={() => loadData()}
          />
          <Button title="Vissza" secondary onPress={() => setScreen('')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const searchBar = (
    <>
      <View style={st.searchWrap}>
        <Text style={{ fontSize: 20 }}>⌕</Text>
        <TextInput
          placeholder="Keresés: név, márka, méret, kód..."
          placeholderTextColor="#84938a"
          style={st.search}
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity onPress={startScan}>
          <Text style={{ fontSize: 23 }}>▦</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}>
        {[
          ['all', 'Összes'],
          ['stock', 'Készleten'],
          ['low', 'Kevés készlet'],
          ['empty', 'Elfogyott']
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            style={[
              st.chip,
              filter === key && st.chipActive
            ]}
          >
            <Text style={{
              color: filter === key ? 'white' : C.dark,
              fontWeight: '600'
            }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  let content;

  if (tab === 'home') {
    content = (
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} />
        }
      >
        <View style={st.hero}>
          <Text style={st.heroTitle}>Ruhatár</Text>
          <Text style={st.heroSub}>
            Készletkezelés • Értékesítés • Statisztika
          </Text>
          <Text style={st.heroWelcome}>
            Üdvözlünk, {employee.nev || 'Tulajdonos'}!
          </Text>
        </View>

        <View style={st.tiles}>
          <Tile icon="👕" value={`${stats.stock} db`}
            title="Összes készlet" onPress={() => goTo('stock')} />
          <Tile icon="🏷️" value={stats.kinds}
            title="Termékfajta" onPress={() => goTo('stock')} />
          <Tile icon="🛒" value={`${stats.todayCount} db`}
            title="Mai eladás" onPress={() => goTo('sales')} />
          <Tile icon="💰" value={money(stats.todayRevenue)}
            title="Mai bevétel" onPress={() => goTo('stats')} />
        </View>

        {searchBar}

        <Text style={st.sectionTitle}>Gyors műveletek</Text>
        <View style={st.actions}>
          {[
            ['＋', 'Új ruha', () => setScreen('add')],
            ['▦', 'QR beolvasás', startScan],
            ['👕', 'Készlet', () => goTo('stock')],
            ['🛒', 'Eladások', () => goTo('sales')],
            ['📊', 'Statisztika', () => goTo('stats')],
            ['⚙️', 'Továbbiak', () => goTo('more')]
          ].map(([icon, label, fn]) => (
            <TouchableOpacity
              key={label}
              style={st.action}
              onPress={fn}
            >
              <Text style={st.actionIcon}>{icon}</Text>
              <Text style={st.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={st.sectionTitle}>Legutóbbi ruhák</Text>
        {filtered.slice(0, 6).map(item => (
          <ProductCard
            key={item.id}
            item={item}
            onPress={() => openItem(item)}
          />
        ))}
        {filtered.length === 0 && (
          <Text style={st.empty}>Nincs megjeleníthető ruha.</Text>
        )}
        <Button
          title="Teljes készlet megnyitása"
          secondary
          onPress={() => goTo('stock')}
        />
      </ScrollView>
    );
  } else if (tab === 'stock') {
    content = (
      <View style={{ flex: 1 }}>
        <Text style={st.heading}>Ruhakészlet</Text>
        <Text style={st.muted}>
          {filtered.length} termék • {stats.stock} db összesen
        </Text>
        <View style={{ height: 14 }} />
        {searchBar}
        <FlatList
          data={filtered}
          keyExtractor={x => String(x.id)}
          refreshing={refreshing}
          onRefresh={loadData}
          renderItem={({ item }) => (
            <ProductCard item={item} onPress={() => openItem(item)} />
          )}
          ListEmptyComponent={
            <Text style={st.empty}>Nincs találat.</Text>
          }
        />
        <Button
          title="+ Új ruha hozzáadása"
          onPress={() => setScreen('add')}
        />
      </View>
    );
  } else if (tab === 'sales') {
    content = (
      <View style={{ flex: 1 }}>
        <Text style={st.heading}>Eladások</Text>
        <View style={st.panel}>
          <Text style={st.muted}>Mai bevétel</Text>
          <Text style={st.bigNumber}>{money(stats.todayRevenue)}</Text>
          <Text style={st.muted}>
            Ma eladott darab: {stats.todayCount}
          </Text>
        </View>
        <FlatList
          data={sales}
          keyExtractor={x => String(x.id)}
          refreshing={refreshing}
          onRefresh={loadData}
          ListEmptyComponent={
            <Text style={st.empty}>Még nincs rögzített eladás.</Text>
          }
          renderItem={({ item }) => {
            const product = items.find(x => x.id === item.ruha_id);
            return (
              <View style={st.product}>
                <View style={{ flex: 1 }}>
                  <Text style={st.productName}>
                    {product?.nev || 'Eladott ruha'}
                  </Text>
                  <Text style={st.muted}>
                    {item.darabszam} db •{' '}
                    {item.eladva
                      ? new Date(item.eladva).toLocaleString('hu-HU')
                      : ''}
                  </Text>
                </View>
                <Text style={st.price}>{money(item.osszeg)}</Text>
              </View>
            );
          }}
        />
      </View>
    );
  } else if (tab === 'stats') {
    content = (
      <ScrollView>
        <Text style={st.heading}>Statisztikák</Text>
        <View style={st.tiles}>
          <Tile icon="👕" title="Készlet" value={`${stats.stock} db`} />
          <Tile icon="🏷️" title="Termékfajta" value={stats.kinds} />
          <Tile icon="⚠️" title="Kevés / nincs" value={stats.low} />
          <Tile icon="🛒" title="Mai eladás" value={stats.todayCount} />
        </View>
        <View style={st.panel}>
          <Text style={st.muted}>Mai bevétel</Text>
          <Text style={st.bigNumber}>{money(stats.todayRevenue)}</Text>
        </View>
        <View style={st.panel}>
          <Text style={st.muted}>Készlet teljes eladási értéke</Text>
          <Text style={st.bigNumber}>{money(stats.stockValue)}</Text>
        </View>
        <View style={st.panel}>
          <Text style={st.muted}>
            Rögzített eladások bevétele
          </Text>
          <Text style={st.bigNumber}>{money(stats.totalRevenue)}</Text>
          <Text style={st.muted}>
            Az utolsó 300 betöltött eladás alapján.
          </Text>
        </View>
        <Button
          title="Adatok frissítése"
          onPress={loadData}
          disabled={refreshing}
        />
      </ScrollView>
    );
  } else {
    content = (
      <ScrollView>
        <Text style={st.heading}>Továbbiak</Text>
        <View style={st.panel}>
          <Text style={st.productName}>Fiók</Text>
          <Text style={st.muted}>{employee.nev || 'Dolgozó'}</Text>
          <Text style={st.muted}>
            Jogosultság: {isOwner ? 'Tulajdonos' : 'Dolgozó'}
          </Text>
        </View>
        <View style={st.panel}>
          <Text style={st.productName}>Felhős készlet</Text>
          <Text style={st.muted}>
            Az adatok a közös Supabase-adatbázisban vannak.
          </Text>
          <Text style={st.muted}>
            A régi, telefonon tárolt készlet még nincs átmásolva.
          </Text>
        </View>
        <Button title="Készlet frissítése" onPress={loadData} />
        <Button
          title="Kijelentkezés"
          danger
          onPress={() => Alert.alert(
            'Kijelentkezés',
            'Biztosan kijelentkezel erről a telefonról?',
            [
              { text: 'Mégse', style: 'cancel' },
              {
                text: 'Kijelentkezés',
                onPress: async () => {
                  const { error } = await supabase.auth.signOut();
                  if (error) Alert.alert('Hiba', error.message);
                }
              }
            ]
          )}
        />
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={st.page}>
      <View style={{ flex: 1 }}>{content}</View>

      <View style={st.nav}>
        {[
          ['home', '⌂', 'Kezdőlap'],
          ['stock', '♧', 'Készlet'],
          ['sales', '🛒', 'Eladás'],
          ['stats', '▥', 'Statisztika'],
          ['more', '☰', 'Több']
        ].map(([key, icon, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => goTo(key)}
            style={[st.navItem, tab === key && st.navActive]}
          >
            <Text style={[
              st.navIcon,
              tab === key && { color: C.dark }
            ]}>{icon}</Text>
            <Text style={[
              st.navText,
              tab === key && { color: C.dark }
            ]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  page: {
    flex: 1, backgroundColor: C.bg,
    paddingHorizontal: 14, paddingTop: 12
  },
  center: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', gap: 14
  },
  hero: {
    backgroundColor: C.dark, padding: 22,
    borderRadius: 22, marginBottom: 16
  },
  heroTitle: {
    fontSize: 34, fontWeight: '900', color: 'white'
  },
  heroSub: {
    color: '#cbe7d8', marginTop: 3, fontSize: 13
  },
  heroWelcome: {
    color: 'white', fontSize: 16, marginTop: 17
  },
  tiles: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', marginBottom: 12
  },
  tile: {
    width: '48.5%', backgroundColor: C.light,
    padding: 15, borderRadius: 18,
    marginBottom: 10, alignItems: 'center',
    minHeight: 115, justifyContent: 'center'
  },
  tileIcon: { fontSize: 23, marginBottom: 5 },
  tileValue: {
    fontSize: 20, fontWeight: '900', color: C.dark,
    textAlign: 'center'
  },
  tileTitle: {
    color: C.green, fontSize: 12,
    textAlign: 'center', marginTop: 4
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 14,
    paddingHorizontal: 13, borderWidth: 1,
    borderColor: C.border, marginBottom: 12
  },
  search: { flex: 1, padding: 12, fontSize: 14 },
  chip: {
    paddingHorizontal: 15, paddingVertical: 9,
    backgroundColor: C.light, borderRadius: 20,
    marginRight: 8, marginBottom: 2
  },
  chipActive: { backgroundColor: C.green },
  sectionTitle: {
    fontSize: 20, fontWeight: '800',
    color: C.dark, marginVertical: 12
  },
  actions: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  action: {
    width: '31.5%', backgroundColor: 'white',
    borderWidth: 1, borderColor: C.border,
    borderRadius: 16, alignItems: 'center',
    padding: 13, marginBottom: 9
  },
  actionIcon: { fontSize: 29, marginBottom: 7 },
  actionLabel: {
    fontSize: 12, fontWeight: '700',
    color: C.dark, textAlign: 'center'
  },
  product: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 16,
    padding: 12, marginBottom: 9,
    borderWidth: 1, borderColor: C.border,
    gap: 12
  },
  productImage: {
    width: 70, height: 78, borderRadius: 12,
    backgroundColor: C.light,
    alignItems: 'center', justifyContent: 'center'
  },
  productName: {
    fontSize: 16, fontWeight: '800', color: C.dark
  },
  muted: { color: C.gray, fontSize: 13, marginTop: 4 },
  price: {
    color: C.dark, fontWeight: '800',
    fontSize: 16, marginTop: 5
  },
  stock: {
    backgroundColor: C.gold, color: C.dark,
    overflow: 'hidden', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 6,
    fontSize: 12, fontWeight: '800'
  },
  outStock: { backgroundColor: '#fbe3e1', color: C.red },
  heading: {
    fontSize: 27, fontWeight: '900',
    color: C.dark, marginBottom: 8
  },
  panel: {
    backgroundColor: 'white', padding: 17,
    borderRadius: 17, marginBottom: 13,
    borderWidth: 1, borderColor: C.border
  },
  bigNumber: {
    fontSize: 28, fontWeight: '900',
    color: C.dark, marginVertical: 7
  },
  button: {
    backgroundColor: C.green, padding: 15,
    borderRadius: 12, alignItems: 'center',
    marginBottom: 10
  },
  secondaryButton: {
    backgroundColor: C.light,
    borderWidth: 1, borderColor: C.border
  },
  buttonText: {
    color: 'white', fontSize: 15, fontWeight: '800'
  },
  label: {
    fontWeight: '700', color: C.dark,
    marginBottom: 6
  },
  input: {
    backgroundColor: C.bg, borderRadius: 11,
    borderWidth: 1, borderColor: C.border,
    padding: 13, fontSize: 16, color: C.dark
  },
  qrPanel: {
    backgroundColor: 'white', borderRadius: 18,
    padding: 22, alignItems: 'center',
    marginVertical: 16
  },
  code: {
    color: C.dark, fontWeight: '700',
    marginTop: 14
  },
  detailPhoto: {
    width: '100%', height: 220,
    borderRadius: 15, marginTop: 14
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1,
    borderBottomColor: C.border, gap: 12
  },
  detailValue: {
    flex: 1, textAlign: 'right',
    fontWeight: '700', color: C.dark
  },
  empty: {
    color: C.gray, textAlign: 'center',
    marginVertical: 30
  },
  nav: {
    flexDirection: 'row', backgroundColor: C.dark,
    borderRadius: 18, padding: 6, marginBottom: 5
  },
  navItem: {
    flex: 1, alignItems: 'center',
    paddingVertical: 9, borderRadius: 14
  },
  navActive: { backgroundColor: '#dff5d6' },
  navIcon: {
    color: 'white', fontSize: 23, fontWeight: '800'
  },
  navText: {
    color: 'white', fontSize: 10,
    fontWeight: '700', marginTop: 3
  }
});
