
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, StyleSheet
} from 'react-native';
import { supabase } from './supabase';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [loading, setLoading] = useState(false);

  const address = email.trim().toLowerCase();

  async function sendCode() {
    if (!address || !address.includes('@')) {
      Alert.alert('Hiba', 'Adj meg egy érvényes e-mail-címet.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: false
        }
      });

      if (error) throw error;

      setStep('code');
      Alert.alert(
        'Aktiválás',
        'Ha a fiókod létezik, ellenőrző kódot kapsz e-mailben.'
      );
    } catch (e) {
      Alert.alert('Hiba', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    if (!code.trim()) {
      Alert.alert('Hiba', 'Írd be az ellenőrző kódot.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: address,
        token: code.trim(),
        type: 'email'
      });

      if (error) throw error;

      const { data: employee, error: employeeError } =
        await supabase
          .from('dolgozok')
          .select('id, nev, szerepkor')
          .eq('id', data.user.id)
          .maybeSingle();

      if (employeeError) throw employeeError;

      if (!employee) {
        await supabase.auth.signOut();

        Alert.alert(
          'Jóváhagyás szükséges',
          'A tulajdonosnak előbb engedélyeznie kell a hozzáférésedet.'
        );
        return;
      }

      onLogin?.(employee);
    } catch (e) {
      Alert.alert('Sikertelen aktiválás', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Ruhatár</Text>

        <Text style={styles.subtitle}>
          {step === 'email'
            ? 'Telefon egyszeri aktiválása'
            : 'Ellenőrző kód megadása'}
        </Text>

        {step === 'email' ? (
          <TextInput
            style={styles.input}
            placeholder="E-mail-cím"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        ) : (
          <>
            <Text style={styles.info}>
              A kódot erre a címre kértük: {address}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="E-mailben kapott kód"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
          </>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={step === 'email' ? sendCode : activate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>
              {step === 'email'
                ? 'Aktiváló kód kérése'
                : 'Telefon aktiválása'}
            </Text>
          )}
        </TouchableOpacity>

        {step === 'code' && (
          <TouchableOpacity
            onPress={() => {
              setCode('');
              setStep('email');
            }}
          >
            <Text style={styles.link}>
              Másik e-mail-cím vagy új kód
            </Text>
          </TouchableOpacity>
        )}
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
  info: {
    color: '#527064',
    marginBottom: 16
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
  link: {
    color: '#246a4e',
    textAlign: 'center',
    padding: 16
  }
});
