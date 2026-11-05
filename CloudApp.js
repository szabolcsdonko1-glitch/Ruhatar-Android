
import React, {
  useState, useEffect, useCallback, useMemo
} from 'react';

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, FlatList, Alert, StyleSheet,
  SafeAreaView, ActivityIndicator, Image,
  RefreshControl
} from 'react-native';

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import QRCode from 'react-native-qrcode-svg';

import { supabase } from './supabase';
import LoginScreen from './LoginScreen';

const C = {
  dark: '#103e30',
  green: '#126447',
  pale: '#e9f4ed',
  bg: '#f6f8f6',
  white: '#ffffff',
  gray: '#66756e',
  border: '#e0e8e2',
  red: '#b23c36'
};

const empty = {
  nev: '',
  meret: '',
  marka: '',
  szin: '',
  kategoria: '',
  hely: '',
  eladasi_ar: '',
  beszerzesi_ar: '',
  darabszam: '1',
  megjegyzes: ''
};

const num = x => Number(x) || 0;
const money = x =>
  Math.round(num(x)).toLocaleString('hu-HU') + ' Ft';

function Btn({ title, onPress, light, red, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        S.btn,
        light && S.btnLight,
        red && { backgroundColor: C.red },
        disabled && { opacity: 0.5 }
      ]}
    >
      <Text style={[
        S.btnText,
        light && { color: C.dark }
      ]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, change, numeric, multiline }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={S.label}>{label}</Text>
      <TextInput
        style={[S.input, multiline && { height: 85 }]}
        value={value}
        onChangeText={change}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        placeholder={label}
        placeholderTextColor="#9aa69e"
      />
    </View>
  );
}

function Card({ item, image, onPress }) {
  return (
    <TouchableOpacity style={S.product} onPress={onPress}>
      <View style={S.thumb}>
        {image ? (
          <Image source={{ uri: image }} style={S.thumbImage} />
        ) : (
          <Text style={{ fontSize: 32 }}>👕</Text>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={S.productName}>{item.nev}</Text>
        <Text style={S.small}>
          {item.marka || 'Márka nélkül'} • {item.meret || '-'}
        </Text>
        <Text style={S.small}>{item.kod}</Text>
        <Text style={S.price}>{money(item.eladasi_ar)}</Text>
      </View>

      <View style={S.stockTag}>
        <Text style={S.stockText}>{item.darabszam} db</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CloudApp() {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [photos, setPhotos] = useState({});

  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({ ...empty });
  const [localPhoto, setLocalPhoto] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [scanLocked, setScanLocked] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState('1');
  const [adjustReason, setAdjustReason] = useState('Készletkorrekció');

  const [, requestCamera] = useCameraPermissions();

  const owner = employee?.szerepkor === 'tulajdonos';
  const selected = items.find(x => x.id === selectedId);

  const refresh = useCallback(async (showError = true) => {
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
      if (showError) {
        Alert.alert('Felhőhiba', err.message);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const identify = useCallback(async user => {
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
      Alert.alert('Belépési hiba', err.message);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) identify(data?.user);
    }).catch(() => {
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;

        if (event === 'SIGNED_OUT') {
          setEmployee(null);
          setItems([]);
          setSales([]);
          setPhotos({});
          setScreen('');
        }

        if (event === 'SIGNED_IN' && session?.user) {
          identify(session.user);
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [identify]);

  useEffect(() => {
    if (employee?.id) refresh();
  }, [employee?.id, refresh]);

  useEffect(() => {
    if (!employee?.id || items.length === 0) return;

    let cancelled = false;

    async function loadPhotos() {
      const next = {};

      await Promise.all(items.map(async item => {
        if (!item.foto_url) return;

        if (item.foto_url.startsWith('https://')) {
          next[item.id] = item.foto_url;
          return;
        }

        const { data, error } = await supabase.storage
          .from('ruhatar-kepek')
          .createSignedUrl(item.foto_url, 3600);

        if (!error && data?.signedUrl) {
          next[item.id] = data.signedUrl;
        }
      }));

      if (!cancelled) setPhotos(next);
    }

    loadPhotos();

    return () => { cancelled = true; };
  }, [items, employee?.id]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todaySales = sales.filter(x =>
      x.eladva &&
      new Date(x.eladva).toDateString() === today
    );

    return {
      count: items.reduce((a, x) => a + num(x.darabszam), 0),
      types: items.length,
      low: items.filter(x => num(x.darabszam) <= 2).length,
      value: items.reduce(
        (a, x) => a + num(x.darabszam) * num(x.eladasi_ar), 0
      ),
      todayCount: todaySales.reduce(
        (a, x) => a + num(x.darabszam), 0
      ),
      todayMoney: todaySales.reduce(
        (a, x) => a + num(x.osszeg), 0
      ),
      revenue: sales.reduce(
        (a, x) => a + num(x.osszeg), 0
      )
    };
  }, [items, sales]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return items.filter(x => {
      const text = [
        x.nev, x.kod, x.meret, x.marka,
        x.szin, x.kategoria, x.hely
      ].join(' ').toLowerCase();

      if (q && !text.includes(q)) return false;
      if (filter === 'stock' && num(x.darabszam) < 1) return false;
      if (filter === 'low' && num(x.darabszam) > 2) return false;
      if (filter === 'empty' && num(x.darabszam) !== 0) return false;
      return true;
    });
  }, [items, query, filter]);

  function startAdd() {
    setEditingId(null);
    setForm({ ...empty });
    setLocalPhoto(null);
    setScreen('form');
  }

  function startEdit(item) {
    setEditingId(item.id);
    setSelectedId(item.id);
    setLocalPhoto(null);

    setForm({
      nev: item.nev || '',
      meret: item.meret || '',
      marka: item.marka || '',
      szin: item.szin || '',
      kategoria: item.kategoria || '',
      hely: item.hely || '',
      eladasi_ar: String(item.eladasi_ar ?? ''),
      beszerzesi_ar: String(item.beszerzesi_ar ?? ''),
      darabszam: String(item.darabszam ?? 0),
      megjegyzes: item.megjegyzes || ''
    });

    setScreen('form');
  }

  async function choosePhoto(camera) {
    try {
      let result;

      if (camera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();

        if (!p.granted) {
          Alert.alert('Engedély szükséges', 'Engedélyezd a kamerát.');
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          allowsEditing: true
        });
      } else {
        const p =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!p.granted) {
          Alert.alert('Engedély szükséges', 'Engedélyezd a galériát.');
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.6,
          allowsEditing: true
        });
      }

      if (!result.canceled && result.assets?.[0]) {
        setLocalPhoto(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('Fényképhiba', err.message);
    }
  }

  async function uploadPhoto(uri) {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError) throw userError;

    const uid = userData?.user?.id;
    if (!uid) throw new Error('Nincs aktív készülékkapcsolat.');

    const info = await FileSystem.getInfoAsync(uri);

    if (info.exists && info.size > 5 * 1024 * 1024) {
      throw new Error('A fénykép túl nagy. Maximum 5 MB.');
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    const path = uid + '/' + Date.now() + '-' +
      Math.random().toString(36).slice(2, 10) + '.jpg';

    const { error } = await supabase.storage
      .from('ruhatar-kepek')
      .upload(path, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (error) throw error;
    return path;
  }

  async function saveItem() {
    if (busy) return;

    const name = form.nev.trim();
    const price = Number(form.eladasi_ar.replace(',', '.'));
    const cost = form.beszerzesi_ar.trim()
      ? Number(form.beszerzesi_ar.replace(',', '.'))
      : null;
    const count = Number(form.darabszam);

    if (!name || !form.eladasi_ar.trim()) {
      Alert.alert('Hiányzó adat', 'Név és eladási ár kötelező.');
      return;
    }

    if (
      !Number.isFinite(price) || price < 0 ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0)) ||
      (!editingId && (!Number.isInteger(count) || count < 0))
    ) {
      Alert.alert('Hibás adat', 'Ellenőrizd az árakat és a darabszámot.');
      return;
    }

    setBusy(true);

    try {
      const fields = {
        nev: name,
        meret: form.meret.trim(),
        marka: form.marka.trim(),
        szin: form.szin.trim(),
        kategoria: form.kategoria.trim(),
        hely: form.hely.trim(),
        eladasi_ar: price,
        beszerzesi_ar: cost,
        megjegyzes: form.megjegyzes.trim()
      };

      if (localPhoto) {
        fields.foto_url = await uploadPhoto(localPhoto);
      }

      if (editingId) {
        const { data, error } = await supabase
          .from('ruhak')
          .update(fields)
          .eq('id', editingId)
          .select('id')
          .single();

        if (error) throw error;
        if (!data) throw new Error('A módosítás nem sikerült.');
      } else {
        const kod = 'R-' +
          Date.now().toString(36).toUpperCase() + '-' +
          Math.random().toString(36).slice(2, 10).toUpperCase();

        const { error } = await supabase.from('ruhak').insert({
          ...fields,
          kod,
          darabszam: count
        });

        if (error) throw error;
      }

      setScreen('');
      setTab('stock');
      setEditingId(null);
      setLocalPhoto(null);
      setForm({ ...empty });

      await refresh();

      Alert.alert('Sikeres mentés', 'A felhős készlet frissült.');
    } catch (err) {
      Alert.alert('Mentési hiba', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sell(item) {
    if (busy) return;

    setBusy(true);

    try {
      const { error } = await supabase.rpc('ruha_eladasa', {
        p_ruha_id: item.id,
        p_darabszam: 1,
        p_osszeg: num(item.eladasi_ar)
      });

      if (error) throw error;

      await refresh();
      setScreen('');
      setTab('sales');

      Alert.alert('Sikeres eladás', '1 db levonva a készletből.');
    } catch (err) {
      Alert.alert('Eladási hiba', err.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmSale(item) {
    Alert.alert(
      'Eladás rögzítése',
      item.nev + '\n1 db • ' + money(item.eladasi_ar),
      [
        { text: 'Mégse', style: 'cancel' },
        { text: 'Eladva', onPress: () => sell(item) }
      ]
    );
  }

  async function adjust(sign) {
    if (!selected || !owner || busy) return;

    const amount = Number(adjustAmount);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      Alert.alert('Hibás mennyiség', 'Adj meg pozitív egész számot.');
      return;
    }

    Alert.alert(
      'Készlet módosítása',
      `${selected.nev}\n${sign > 0 ? '+' : '-'}${amount} db`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Megerősítés',
          onPress: async () => {
            setBusy(true);

            try {
              const { error } = await supabase.rpc(
                'keszlet_modositas',
                {
                  p_ruha_id: selected.id,
                  p_valtozas: sign * amount,
                  p_indok: adjustReason.trim() || 'Készletkorrekció'
                }
              );

              if (error) throw error;

              await refresh();
              setScreen('detail');
              Alert.alert('Kész', 'A készlet módosult.');
            } catch (err) {
              Alert.alert('Hiba', err.message);
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  }

  async function startScan() {
    const p = await requestCamera();

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

    try {
      let item = items.find(x => x.kod === data);

      if (!item) {
        const result = await supabase.from('ruhak')
          .select('*').eq('kod', data).maybeSingle();

        if (result.error) throw result.error;
        item = result.data;
      }

      if (!item) {
        Alert.alert('Nem található', 'Ismeretlen QR-kód.');
        setScreen('');
        return;
      }

      setSelectedId(item.id);

      if (!items.some(x => x.id === item.id)) {
        await refresh();
      }

      setScreen('detail');
    } catch (err) {
      Alert.alert('QR-hiba', err.message);
      setScreen('');
    }
  }

  function navigate(next) {
    setScreen('');
    setTab(next);
    refresh(false);
  }

  const search = (
    <>
      <View style={S.searchRow}>
        <TextInput
          style={S.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Keresés: név, márka, méret, kód..."
          placeholderTextColor="#8b9a90"
        />
        <TouchableOpacity onPress={startScan}>
          <Text style={{ fontSize: 25 }}>▦</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
              S.chip,
              filter === key && { backgroundColor: C.green }
            ]}
          >
            <Text style={{
              color: filter === key ? 'white' : C.dark,
              fontWeight: '700'
            }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={C.green} />
        <Text>Ruhatár betöltése...</Text>
      </View>
    );
  }

  if (!employee) {
    return (
      <LoginScreen onLogin={async () => {
        setLoading(true);
        const { data } = await supabase.auth.getUser();
        await identify(data?.user);
      }} />
    );
  }

  if (screen === 'scan') {
    return (
      <SafeAreaView style={S.page}>
        <Text style={S.heading}>QR-kód beolvasása</Text>

        <CameraView
          style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanLocked ? undefined : onScan}
        />

        <Btn title="Vissza" light onPress={() => setScreen('')} />
      </SafeAreaView>
    );
  }

  if (screen === 'form') {
    return (
      <SafeAreaView style={S.page}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={S.heading}>
            {editingId ? 'Ruha szerkesztése' : 'Új ruha'}
          </Text>

          <View style={S.panel}>
            <Text style={S.label}>Ruha fényképe</Text>

            {(localPhoto ||
              (editingId && photos[editingId])) && (
              <Image
                source={{
                  uri: localPhoto || photos[editingId]
                }}
                style={S.formImage}
                resizeMode="contain"
              />
            )}

            <Btn
              title="📷 Fényképezés"
              light
              onPress={() => choosePhoto(true)}
            />

            <Btn
              title="🖼️ Kép a galériából"
              light
              onPress={() => choosePhoto(false)}
            />

            {[
              ['nev', 'Ruha neve *'],
              ['kategoria', 'Kategória'],
              ['marka', 'Márka'],
              ['meret', 'Méret'],
              ['szin', 'Szín'],
              ['hely', 'Raktári hely'],
              ['eladasi_ar', 'Eladási ár (Ft) *'],
              ['beszerzesi_ar', 'Beszerzési ár (Ft)'],
              ...(!editingId ? [['darabszam', 'Darabszám']] : []),
              ['megjegyzes', 'Megjegyzés']
            ].map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={form[key]}
                change={value => setForm(old => ({
                  ...old,
                  [key]: value
                }))}
                numeric={[
                  'eladasi_ar', 'beszerzesi_ar', 'darabszam'
                ].includes(key)}
                multiline={key === 'megjegyzes'}
              />
            ))}

            <Btn
              title={busy ? 'Mentés...' : '✓ Mentés a felhőbe'}
              disabled={busy}
              onPress={saveItem}
            />

            <Btn
              title="Mégse"
              light
              onPress={() => setScreen(editingId ? 'detail' : '')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'adjust' && selected) {
    return (
      <SafeAreaView style={S.page}>
        <ScrollView>
          <Text style={S.heading}>Készletkorrekció</Text>

          <View style={S.panel}>
            <Text style={S.productName}>{selected.nev}</Text>
            <Text style={S.small}>
              Jelenleg: {selected.darabszam} db
            </Text>

            <Field
              label="Mennyiség"
              value={adjustAmount}
              numeric
              change={setAdjustAmount}
            />

            <Field
              label="Indok"
              value={adjustReason}
              change={setAdjustReason}
            />

            <Btn
              title="+ Készlet növelése"
              disabled={busy}
              onPress={() => adjust(1)}
            />

            <Btn
              title="- Készlet csökkentése"
              red
              disabled={busy}
              onPress={() => adjust(-1)}
            />
          </View>

          <Btn
            title="Vissza"
            light
            onPress={() => setScreen('detail')}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'detail') {
    if (!selected) {
      return (
        <SafeAreaView style={S.page}>
          <Text>Nem található a ruha.</Text>
          <Btn title="Vissza" onPress={() => setScreen('')} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={S.page}>
        <ScrollView>
          <Text style={S.heading}>{selected.nev}</Text>
          <Text style={S.small}>{selected.kod}</Text>

          {photos[selected.id] && (
            <Image
              source={{ uri: photos[selected.id] }}
              style={S.detailImage}
              resizeMode="contain"
            />
          )}

          <View style={S.qr}>
            <QRCode value={selected.kod} size={190} />
            <Text style={S.small}>{selected.kod}</Text>
          </View>

          <View style={S.panel}>
            {[
              ['Márka', selected.marka],
              ['Kategória', selected.kategoria],
              ['Méret', selected.meret],
              ['Szín', selected.szin],
              ['Hely', selected.hely],
              ['Darabszám', selected.darabszam + ' db'],
              ['Eladási ár', money(selected.eladasi_ar)],
              ['Megjegyzés', selected.megjegyzes]
            ].map(([label, value]) => (
              <View key={label} style={S.detailRow}>
                <Text style={S.small}>{label}</Text>
                <Text style={S.detailValue}>{value || '-'}</Text>
              </View>
            ))}
          </View>

          <Btn
            title="✏️ Ruha szerkesztése"
            light
            onPress={() => startEdit(selected)}
          />

          {owner && (
            <Btn
              title="📦 Készlet módosítása"
              light
              onPress={() => {
                setAdjustAmount('1');
                setScreen('adjust');
              }}
            />
          )}

          <Btn
            title="🛒 1 db eladása"
            disabled={busy || num(selected.darabszam) < 1}
            onPress={() => confirmSale(selected)}
          />

          <Btn title="Vissza" light onPress={() => setScreen('')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  let content;

  if (tab === 'home') {
    content = (
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={S.hero}>
          <Text style={S.heroTitle}>Ruhatár</Text>
          <Text style={S.heroSub}>
            Készletkezelés • Értékesítés • Statisztika
          </Text>
          <Text style={S.welcome}>
            Üdvözlünk, {employee.nev || 'Dolgozó'}!
          </Text>
        </View>

        <View style={S.tiles}>
          {[
            ['👕', stats.count + ' db', 'Készlet'],
            ['🏷️', stats.types, 'Termékfajta'],
            ['🛒', stats.todayCount + ' db', 'Mai eladás'],
            ['💰', money(stats.todayMoney), 'Mai bevétel']
          ].map(([icon, value, label]) => (
            <View key={label} style={S.tile}>
              <Text style={S.tileIcon}>{icon}</Text>
              <Text style={S.tileValue}>{value}</Text>
              <Text style={S.tileLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {search}

        <Text style={S.section}>Gyors műveletek</Text>

        <View style={S.actions}>
          {[
            ['＋', 'Új ruha', startAdd],
            ['▦', 'QR beolvasás', startScan],
            ['👕', 'Készlet', () => navigate('stock')],
            ['🛒', 'Eladások', () => navigate('sales')],
            ['📊', 'Statisztika', () => navigate('stats')],
            ['⚙️', 'Továbbiak', () => navigate('more')]
          ].map(([icon, label, action]) => (
            <TouchableOpacity
              key={label}
              style={S.action}
              onPress={action}
            >
              <Text style={S.actionIcon}>{icon}</Text>
              <Text style={S.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={S.section}>Legutóbbi ruhák</Text>

        {filtered.slice(0, 6).map(item => (
          <Card
            key={item.id}
            item={item}
            image={photos[item.id]}
            onPress={() => {
              setSelectedId(item.id);
              setScreen('detail');
            }}
          />
        ))}

        <Btn
          title="Teljes készlet"
          light
          onPress={() => navigate('stock')}
        />
      </ScrollView>
    );
  } else if (tab === 'stock') {
    content = (
      <View style={{ flex: 1 }}>
        <Text style={S.heading}>Ruhakészlet</Text>
        <Text style={S.small}>
          {stats.types} termék • {stats.count} db
        </Text>

        {search}

        <FlatList
          data={filtered}
          keyExtractor={x => String(x.id)}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={
            <Text style={S.empty}>Nincs találat.</Text>
          }
          renderItem={({ item }) => (
            <Card
              item={item}
              image={photos[item.id]}
              onPress={() => {
                setSelectedId(item.id);
                setScreen('detail');
              }}
            />
          )}
        />

        <Btn title="+ Új ruha" onPress={startAdd} />
      </View>
    );
  } else if (tab === 'sales') {
    content = (
      <View style={{ flex: 1 }}>
        <Text style={S.heading}>Eladások</Text>

        <View style={S.panel}>
          <Text style={S.small}>Mai bevétel</Text>
          <Text style={S.big}>{money(stats.todayMoney)}</Text>
          <Text style={S.small}>
            Mai eladott darab: {stats.todayCount}
          </Text>
        </View>

        <FlatList
          data={sales}
          keyExtractor={x => String(x.id)}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={
            <Text style={S.empty}>Még nincs eladás.</Text>
          }
          renderItem={({ item }) => {
            const product = items.find(x => x.id === item.ruha_id);

            return (
              <View style={S.product}>
                <View style={{ flex: 1 }}>
                  <Text style={S.productName}>
                    {product?.nev || 'Eladott ruha'}
                  </Text>
                  <Text style={S.small}>
                    {item.darabszam} db •{' '}
                    {item.eladva
                      ? new Date(item.eladva).toLocaleString('hu-HU')
                      : ''}
                  </Text>
                </View>

                <Text style={S.price}>{money(item.osszeg)}</Text>
              </View>
            );
          }}
        />
      </View>
    );
  } else if (tab === 'stats') {
    content = (
      <ScrollView>
        <Text style={S.heading}>Statisztika</Text>

        {[
          ['Összes készlet', stats.count + ' db'],
          ['Termékfajták', stats.types],
          ['Kevés vagy elfogyott', stats.low],
          ['Mai eladás', stats.todayCount + ' db'],
          ['Mai bevétel', money(stats.todayMoney)],
          ['Készlet eladási értéke', money(stats.value)],
          ['Rögzített bevétel', money(stats.revenue)]
        ].map(([label, value]) => (
          <View key={label} style={S.panel}>
            <Text style={S.small}>{label}</Text>
            <Text style={S.big}>{value}</Text>
          </View>
        ))}

        <Text style={S.small}>
          A bevételi összesítés az utolsó 300 betöltött
          eladás alapján készül.
        </Text>

        <Btn title="Frissítés" onPress={refresh} />
      </ScrollView>
    );
  } else {
    content = (
      <ScrollView>
        <Text style={S.heading}>Beállítások</Text>

        <View style={S.panel}>
          <Text style={S.productName}>
            {employee.nev || 'Dolgozó'}
          </Text>

          <Text style={S.small}>
            {owner ? 'Tulajdonos' : 'Dolgozó'}
          </Text>
        </View>

        <View style={S.panel}>
          <Text style={S.productName}>Közös felhő</Text>
          <Text style={S.small}>
            A ruhák, eladások és feltöltött képek a
            közös felhős rendszerhez kapcsolódnak.
          </Text>
        </View>

        <Btn title="Adatok frissítése" onPress={refresh} />

        <Btn
          title="Kijelentkezés"
          red
          onPress={() => Alert.alert(
            'Kijelentkezés',
            'Biztosan kijelentkezel?',
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
    <SafeAreaView style={S.page}>
      <View style={{ flex: 1 }}>{content}</View>

      <View style={S.nav}>
        {[
          ['home', '⌂', 'Kezdőlap'],
          ['stock', '👕', 'Készlet'],
          ['sales', '🛒', 'Eladás'],
          ['stats', '▥', 'Statisztika'],
          ['more', '☰', 'Több']
        ].map(([key, icon, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => navigate(key)}
            style={[
              S.navItem,
              tab === key && S.navActive
            ]}
          >
            <Text style={S.navIcon}>{icon}</Text>
            <Text style={[
              S.navLabel,
              tab === key && { color: C.dark }
            ]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 14,
    paddingTop: 12
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hero: {
    backgroundColor: C.dark,
    padding: 22,
    borderRadius: 22,
    marginBottom: 15
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: 'white'
  },
  heroSub: {
    color: '#cbe7d8',
    fontSize: 13,
    marginTop: 4
  },
  welcome: {
    color: 'white',
    fontSize: 17,
    marginTop: 18
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  tile: {
    width: '48.5%',
    minHeight: 115,
    backgroundColor: C.pale,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  tileIcon: {
    fontSize: 25,
    marginBottom: 5
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '900',
    color: C.dark,
    textAlign: 'center'
  },
  tileLabel: {
    fontSize: 12,
    color: C.green,
    marginTop: 5
  },
  heading: {
    fontSize: 27,
    fontWeight: '900',
    color: C.dark,
    marginBottom: 12
  },
  section: {
    fontSize: 20,
    fontWeight: '800',
    color: C.dark,
    marginVertical: 14
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    marginBottom: 12
  },
  search: {
    flex: 1,
    padding: 12,
    fontSize: 14
  },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: C.pale,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 12
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  action: {
    width: '31.5%',
    padding: 13,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    marginBottom: 10
  },
  actionIcon: {
    fontSize: 27,
    marginBottom: 7
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.dark,
    textAlign: 'center'
  },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 9,
    gap: 12
  },
  thumb: {
    width: 70,
    height: 78,
    backgroundColor: C.pale,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  thumbImage: {
    width: 68,
    height: 76,
    borderRadius: 10
  },
  productName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.dark
  },
  small: {
    fontSize: 13,
    color: C.gray,
    marginTop: 5
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: C.dark,
    marginTop: 5
  },
  stockTag: {
    backgroundColor: C.pale,
    padding: 9,
    borderRadius: 10
  },
  stockText: {
    color: C.dark,
    fontWeight: '800'
  },
  panel: {
    backgroundColor: 'white',
    borderRadius: 17,
    padding: 17,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: C.border
  },
  big: {
    fontSize: 27,
    fontWeight: '900',
    color: C.dark,
    marginTop: 7
  },
  btn: {
    backgroundColor: C.green,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10
  },
  btnLight: {
    backgroundColor: C.pale,
    borderWidth: 1,
    borderColor: C.border
  },
  btnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 15
  },
  label: {
    fontWeight: '700',
    color: C.dark,
    marginBottom: 6
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 11,
    padding: 13,
    fontSize: 16,
    color: C.dark
  },
  formImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12
  },
  detailImage: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    marginVertical: 12
  },
  qr: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginVertical: 14
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '700',
    color: C.dark
  },
  empty: {
    color: C.gray,
    textAlign: 'center',
    marginTop: 35
  },
  nav: {
    flexDirection: 'row',
    backgroundColor: C.dark,
    borderRadius: 18,
    padding: 6,
    marginBottom: 5
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14
  },
  navActive: {
    backgroundColor: '#dff5d6'
  },
  navIcon: {
    fontSize: 23,
    textAlign: 'center'
  },
  navLabel: {
    fontSize: 10,
    color: 'white',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4
  }
});
