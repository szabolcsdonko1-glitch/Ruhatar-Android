
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from './supabase';

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    const address = email.trim().toLowerCase();

    if (!address || (mode !== 'reset' && !password)) {
      Alert.alert('Hiányzó adat', 'Töltsd ki a szükséges mezőket.');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      Alert.alert('Hiányzó adat', 'Add meg a nevedet.');
      return;
    }

    if (mode === 'register' && password.length < 8) {
      Alert.alert('Rövid jelszó', 'Legalább 8 karakter szükséges.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(address);
        if (error) throw error;

        Alert.alert(
          'E-mail elküldve',
          'Ha létezik a fiók, jelszó-visszaállító levelet kapsz. A jelszócsere linkjének alkalmazáson belüli kezelése még beállítást igényel.'
        );
        setMode('login');
        return;
      }

      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: {
            data: { nev: name.trim() }
          }
        });

        if (error) throw error;
        if (data.session) await supabase.auth.signOut();

        Alert.alert(
          'Regisztráció elküldve',
          'Ellenőrizd az e-mailjeidet. A készlethez tulajdonosi jóváhagyás után férhetsz hozzá.'
        );

        setPassword('');
        setMode('login');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: address,
        password
      });

      if (error) throw error;

      const { data: employee, error: employeeError } = await supabase
        .from('dolgozok')
        .select('id, nev, szerepkor')
        .eq('id', data.user.id)
        .maybeSingle();

      if (employeeError) throw employeeError;

      if (!employee) {
        await supabase.auth.signOut();
        Alert.alert(
          'Jóváhagyásra vár',
          'A fiókodhoz még nincs dolgozói hozzáférés. A tulajdonos jóváhagyása szükséges.'
        );
        return;
      }

      onLogin?.(employee);
    } catch (error) {
      Alert.alert('Hiba', error.message || 'Sikertelen művelet.');
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === 'register' ? 'Regisztráció' :
    mode === 'reset' ? 'Elfelejtett jelszó' :
    'Dolgozói bejelentkezés';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.brand}>Ruhatár</Text>
          <Text style={styles.subtitle}>{title}</Text>

          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Teljes név"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="E-mail-cím"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          {mode !== 'reset' && (
            <TextInput
              style={styles.input}
              placeholder="Jelszó"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'register' ? 'new-password' : 'password'}
            />
          )}

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'register'
                  ? 'Regisztrálok'
                  : mode === 'reset'
                  ? 'Jelszó-visszaállító e-mail kérése'
                  : 'Bejelentkezés'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' ? (
            <>
              <TouchableOpacity
                style={styles.link}
                onPress={() => setMode('register')}
              >
                <Text style={styles.linkText}>Új fiók regisztrálása</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.link}
                onPress={() => setMode('reset')}
              >
                <Text style={styles.linkText}>Elfelejtettem a jelszavam</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.link}
              onPress={() => setMode('login')}
            >
              <Text style={styles.linkText}>Vissza a bejelentkezéshez</Text>
            </TouchableOpacity>
          )}

          {mode === 'register' && (
            <Text style={styles.note}>
              A készlethez a tulajdonos jóváhagyása szükséges.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf4ef'
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22
  },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 18
  },
  brand: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#18342e',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 16,
    color: '#527064',
    textAlign: 'center',
    marginBottom: 24
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
    padding: 16,
    borderRadius: 10,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center'
  },
  link: {
    padding: 12,
    alignItems: 'center'
  },
  linkText: {
    color: '#246a4e',
    fontWeight: '600'
  },
  note: {
    textAlign: 'center',
    color: '#777',
    marginTop: 10
  }
});
