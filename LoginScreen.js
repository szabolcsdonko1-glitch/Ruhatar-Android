
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, StyleSheet,
  Linking
} from 'react-native';
import { supabase } from './supabase';

const REDIRECT_URL = 'ruhatar://auth';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function openLoginLink(url) {
    if (!url || !url.startsWith(REDIRECT_URL)) return;

    setLoading(true);

    try {
      const fragment = url.split('#')[1] || '';
      const query = url.split('?')[1]?.split('#')[0] || '';

      const params = new URLSearchParams(fragment || query);

      const linkError = params.get('error_description');
      if (linkError) throw new Error(linkError);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        throw new Error(
          'A hivatkozás nem tartalmaz érvényes munkamenetet. Kérj új linket.'
        );
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) throw error;

      const user = data.user;
      if (!user) throw new Error('Nem sikerült azonosítani a felhasználót.');

      const { data: employee, error: employeeError } =
        await supabase
          .from('dolgozok')
          .select('id, nev, szerepkor')
          .eq('id', user.id)
          .maybeSingle();

      if (employeeError) throw employeeError;

      if (!employee) {
        await supabase.auth.signOut();
        Alert.alert(
          'Jóváhagyás szükséges',
          'A fiókodhoz még nincs dolgozói hozzáférés.'
        );
        return;
      }

      onLogin?.(employee);
    } catch (error) {
      Alert.alert(
        'Aktiválási hiba',
        error.message || 'Nem sikerült az aktiválás.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    Linking.getInitialURL().then(url => {
      if (active && url) openLoginLink(url);
    });

    const subscription = Linking.addEventListener(
      'url',
      event => {
        if (active) openLoginLink(event.url);
      }
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  async function sendLink() {
    const address = email.trim().toLowerCase();

    if (!address || !address.includes('@')) {
      Alert.alert(
        'Hiányzó adat',
        'Adj meg egy érvényes e-mail-címet.'
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: REDIRECT_URL
        }
      });

      if (error) throw error;

      Alert.alert(
        'Aktiváló link elküldve',
        'Nyisd meg az e-mailt, és koppints a bejelentkezési linkre. A hivatkozás visszavezet a Ruhatár alkalmazásba.'
      );
    } catch (error) {
      Alert.alert(
        'Hiba',
        error.message || 'Nem sikerült a link elküldése.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Ruhatár</Text>

        <Text style={styles.subtitle}>
          Telefon egyszeri aktiválása
        </Text>

        <Text style={styles.info}>
          Add meg a regisztrált e-mail-címedet.
          Nem kell jelszót megadnod.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="E-mail-cím"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <TouchableOpacity
          style={[
            styles.button,
            loading && { opacity: 0.5 }
          ]}
          onPress={sendLink}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>
              Aktiváló link kérése
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Aktiválás után a Ruhatár automatikusan
          bejelentkezve tart, amíg a munkamenet
          érvényes.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf4ef',
    justifyContent: 'center',
    padding: 22
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 24
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#18342e',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 17,
    color: '#527064',
    textAlign: 'center',
    marginBottom: 20
  },
  info: {
    color: '#527064',
    marginBottom: 16,
    textAlign: 'center'
  },
  input: {
    borderWidth: 1,
    borderColor: '#dce5de',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 16
  },
  button: {
    backgroundColor: '#246a4e',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold'
  },
  note: {
    color: '#777',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 13
  }
});
