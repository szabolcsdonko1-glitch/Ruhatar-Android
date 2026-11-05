
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ScrollView, Alert, StyleSheet,
  ActivityIndicator, SafeAreaView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from './supabase';
import LoginScreen from './LoginScreen';

const C = {
  green: '#246a4e',
  dark: '#18342e',
  bg: '#f6f7f4',
  border: '#dce5de',
  red: '#a83b32'
};

const emptyForm = {
  nev: '',
  meret: '',
  marka: '',
  szin: '',
  hely: '',
  eladasi_ar: '',
  beszerzesi_ar: '',
  darabszam: '1'
};

function Btn({ title, onPress, disabled, danger }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        s.button,
        danger && { backgroundColor: C.red },
        disabled && { opacity: 0.5 }
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ title, value, onChange, numeric }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{title}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
      />
    </View>
  );
}

const ft = value =>
  Number(value || 0).toLocaleString('hu-HU') + ' Ft';

export default function CloudApp() {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [screen, setScreen] = useState('list');
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);

  const checkUser = useCallback(async user => {
    if (!user) {
      setEmployee(null);
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('dolgozok')
        .select('id, nev, szerepkor')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        await supabase.auth.signOut();
        setEmployee(null);
      } else {
        setEmployee(data);
      }
    } catch (e) {
      Alert.alert('Bejelentkezési hiba', e.message);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('ruhak')
        .select('*')
        .order('letrehozva', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      Alert.alert('Készlet hiba', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      checkUser(data.user);
    }).catch(() => {
      if (active) setLoading(false);
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;

        if (event === 'SIGNED_OUT') {
          setEmployee(null);
          setItems([]);
          setScreen('list');
        }

        if (event === 'SIGNED_IN' && session?.user) {
          checkUser(session.user);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [checkUser]);

  useEffect(() => {
    if (employee) loadItems();
  }, [employee?.id, loadItems]);

  async function saveItem() {
    const nev = form.nev.trim();
    const count = Number(form.darabszam);
    const price = Number(form.eladasi_ar.replace(',', '.'));
    const cost = form.beszerzesi_ar.trim()
      ? Number(form.beszerzesi_ar.replace(',', '.'))
      : null;

    if (!nev) {
      Alert.alert('Hiányzó adat', 'Add meg a ruha nevét.');
      return;
    }

    if (
      !Number.isInteger(count) ||
      count < 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0))
    ) {
      Alert.alert('Hibás adat', 'Ellenőrizd az árakat és a darabszámot.');
      return;
    }

    setBusy(true);

    try {
      const kod = 'R-' +
        Date.now().toString(36).toUpperCase() +
        '-' +
        Math.random().toString(36).slice(2, 8).toUpperCase();

      const { error } = await supabase
        .from('ruhak')
        .insert({
          kod,
          nev,
          meret: form.meret.trim(),
          marka: form.marka.trim(),
          szin: form.szin.trim(),
          hely: form.hely.trim(),
          eladasi_ar: price,
          beszerzesi_ar: cost,
          darabszam: count
        });

      if (error) throw error;

      setForm(emptyForm);
      setScreen('list');
      await loadItems();

      Alert.alert('Sikeres mentés', 'A ruha bekerült a közös készletbe.');
    } catch (e) {
      Alert.alert('Mentési hiba', e.message);
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
        p_osszeg: Number(item.eladasi_ar || 0)
      });

      if (error) throw error;

      await loadItems();
      setSelected(null);
      setScreen('list');

      Alert.alert('Sikeres eladás', 'A készlet 1 darabbal csökkent.');
    } catch (e) {
      Alert.alert('Eladási hiba', e.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmSale(item) {
    Alert.alert(
      'Eladás rögzítése',
      `${item.nev}\n1 db\n${ft(item.eladasi_ar)}\n\nBiztosan eladtad?`,
      [
        { text: 'Mégse', style: 'cancel' },
        { text: 'Eladva', onPress: () => sellItem(item) }
      ]
    );
  }

  async function scanCode() {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert('Kameraengedély', 'Engedélyezd a kamera használatát.');
      return;
    }
    setScanLocked(false);
    setScreen('scan');
  }

  function onScanned({ data }) {
    if (scanLocked) return;
    setScanLocked(true);

    const item = items.find(x => x.kod === data);

    if (item) {
      setSelected(item);
      setScreen('detail');
    } else {
      Alert.alert(
        'Nem található',
        'Ez a QR-kód nincs a jelenlegi készletlistában.',
        [
          {
            text: 'OK',
            onPress: () => {
              setScreen('list');
              loadItems();
            }
          }
        ]
      );
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Hiba', error.message);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  if (!employee) {
    return (
      <LoginScreen
        onLogin={async () => {
          setLoading(true);
          const { data } = await supabase.auth.getUser();
          await checkUser(data.user);
        }}
      />
    );
  }

  if (screen === 'scan') {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.title}>QR-kód beolvasása</Text>

        <View style={{ flex: 1, overflow: 'hidden', borderRadius: 14 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanLocked ? undefined : onScanned}
          />
        </View>

        <Btn title="Vissza" onPress={() => setScreen('list')} />
      </SafeAreaView>
    );
  }

  if (screen === 'add') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Új ruha</Text>

          {[
            ['nev', 'Ruha neve'],
            ['meret', 'Méret'],
            ['marka', 'Márka'],
            ['szin', 'Szín'],
            ['hely', 'Tárolási hely'],
            ['eladasi_ar', 'Eladási ár (Ft)'],
            ['beszerzesi_ar', 'Beszerzési ár (Ft)'],
            ['darabszam', 'Darabszám']
          ].map(([key, title]) => (
            <Field
              key={key}
              title={title}
              value={form[key]}
              numeric={[
                'eladasi_ar',
                'beszerzesi_ar',
                'darabszam'
              ].includes(key)}
              onChange={value =>
                setForm(old => ({ ...old, [key]: value }))
              }
            />
          ))}

          <Btn
            title={busy ? 'Mentés...' : 'Ruha mentése a felhőbe'}
            onPress={saveItem}
            disabled={busy}
          />

          <Btn title="Vissza" onPress={() => setScreen('list')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'detail' && selected) {
    const current = items.find(x => x.id === selected.id) || selected;

    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
          <Text style={s.title}>{current.nev}</Text>

          <View style={s.qr}>
            <QRCode value={current.kod} size={210} />
          </View>

          <Text style={s.code}>{current.kod}</Text>

          <View style={[s.card, { alignSelf: 'stretch' }]}>
            <Text>Méret: {current.meret || '-'}</Text>
            <Text>Márka: {current.marka || '-'}</Text>
            <Text>Szín: {current.szin || '-'}</Text>
            <Text>Hely: {current.hely || '-'}</Text>
            <Text>Készleten: {current.darabszam} db</Text>
            <Text style={s.price}>{ft(current.eladasi_ar)}</Text>
          </View>

          <View style={{ alignSelf: 'stretch' }}>
            <Btn
              title={busy ? 'Feldolgozás...' : '1 db eladása'}
              onPress={() => confirmSale(current)}
              disabled={busy || Number(current.darabszam) < 1}
            />
            <Btn
              title="Készlet frissítése"
              onPress={loadItems}
              disabled={refreshing}
            />
            <Btn title="Vissza" onPress={() => setScreen('list')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>Ruhatár</Text>
      <Text style={s.welcome}>
        Üdvözlünk, {employee.nev || 'Dolgozó'}!
      </Text>

      <Text style={s.summary}>
        {items.length} féle ruha •{' '}
        {items.reduce((sum, x) => sum + Number(x.darabszam || 0), 0)} db
      </Text>

      <Btn title="+ Új ruha hozzáadása" onPress={() => setScreen('add')} />
      <Btn title="QR-kód beolvasása" onPress={scanCode} />
      <Btn
        title="Készlet frissítése"
        onPress={loadItems}
        disabled={refreshing}
      />

      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        refreshing={refreshing}
        onRefresh={loadItems}
        ListEmptyComponent={
          <Text style={s.empty}>
            Még nincs ruha a felhős készletben.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => {
              setSelected(item);
              setScreen('detail');
            }}
          >
            <Text style={s.itemName}>{item.nev}</Text>
            <Text>{item.kod}</Text>
            <Text>Méret: {item.meret || '-'}</Text>
            <Text>Készleten: {item.darabszam} db</Text>
            <Text style={s.price}>{ft(item.eladasi_ar)}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity onPress={logout}>
        <Text style={s.logout}>Kijelentkezés</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 18,
    paddingTop: 24
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: C.dark,
    marginBottom: 12
  },
  welcome: {
    fontSize: 17,
    marginBottom: 10
  },
  summary: {
    color: C.green,
    fontWeight: 'bold',
    marginBottom: 14
  },
  button: {
    backgroundColor: C.green,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10
  },
  itemName: {
    fontSize: 19,
    fontWeight: 'bold',
    color: C.dark
  },
  price: {
    fontWeight: 'bold',
    color: C.green,
    fontSize: 17,
    marginTop: 6
  },
  label: {
    fontWeight: 'bold',
    color: C.dark,
    marginBottom: 5
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'white',
    padding: 13,
    borderRadius: 10,
    fontSize: 16
  },
  empty: {
    textAlign: 'center',
    color: '#777',
    marginTop: 36
  },
  logout: {
    color: C.red,
    textAlign: 'center',
    fontWeight: 'bold',
    padding: 12
  },
  qr: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 14,
    marginVertical: 16
  },
  code: {
    marginBottom: 20,
    fontWeight: 'bold'
  }
});
