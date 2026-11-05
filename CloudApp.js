
import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, StyleSheet
} from 'react-native';
import { supabase } from './supabase';
import LoginScreen from './LoginScreen';

export default function CloudApp() {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function checkUser(currentUser) {
    if (!currentUser) {
      setUser(null);
      setEmployee(null);
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('dolgozok')
      .select('id, nev, szerepkor')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error || !data) {
      await supabase.auth.signOut();
      setUser(null);
      setEmployee(null);
      setLoading(false);
      return;
    }

    setUser(currentUser);
    setEmployee(data);
    setLoading(false);
  }

  async function loadItems() {
    setRefreshing(true);

    const { data, error } = await supabase
      .from('ruhak')
      .select('*')
      .order('letrehozva', { ascending: false });

    if (error) {
      Alert.alert('Hiba', error.message);
    } else {
      setItems(data || []);
    }

    setRefreshing(false);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) checkUser(data.user);
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        if (!session) {
          setUser(null);
          setEmployee(null);
          setItems([]);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (employee) loadItems();
  }, [employee]);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Hiba', error.message);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#246a4e" />
      </View>
    );
  }

  if (!user) {
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ruhatár</Text>
      <Text style={styles.subtitle}>
        Üdvözlünk, {employee?.nev || 'Dolgozó'}!
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={loadItems}
      >
        <Text style={styles.buttonText}>
          Készlet frissítése
        </Text>
      </TouchableOpacity>

      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        refreshing={refreshing}
        onRefresh={loadItems}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Még nincs ruha a felhős készletben.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>
              {item.nev || 'Névtelen ruha'}
            </Text>
            <Text>Kód: {item.kod}</Text>
            <Text>Méret: {item.meret || '-'}</Text>
            <Text>
              Készleten: {item.darabszam ?? 0} db
            </Text>
            <Text>
              Ár: {item.eladasi_ar ?? 0} Ft
            </Text>
          </View>
        )}
      />

      <TouchableOpacity onPress={logout}>
        <Text style={styles.logout}>Kijelentkezés</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f7f4',
    padding: 20,
    paddingTop: 50
  },
  center: {
    flex: 1,
    justifyContent: 'center'
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#18342e'
  },
  subtitle: {
    marginBottom: 18,
    fontSize: 16
  },
  button: {
    backgroundColor: '#246a4e',
    padding: 14,
    borderRadius: 10,
    marginBottom: 15
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#777'
  },
  logout: {
    textAlign: 'center',
    color: '#a83b32',
    padding: 16,
    fontWeight: 'bold'
  }
});
