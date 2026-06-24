import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATALOG_ITEMS = [
  { screen: 'Diagnostico', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico por marca e código', color: Colors.accent },
  { screen: 'Clientes', icon: 'account-group-outline', label: 'Clientes', desc: 'Gerencie seus clientes', color: '#7C3AED' },
  { screen: 'Servicos', icon: 'wrench-outline', label: 'Serviços', desc: 'Catálogo de serviços', color: Colors.primary },
  { screen: 'Produtos', icon: 'package-variant-closed', label: 'Produtos', desc: 'Peças e materiais', color: '#0891B2' },
] as const;

export default function CatalogoScreen() {
  const nav = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <GradientHeader title="Catálogo" subtitle="Clientes, serviços e produtos" />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: 12 }}>
        {CATALOG_ITEMS.map((item, idx) => (
          <AnimatedEntrance key={item.screen} index={idx}>
            <TouchableOpacity style={styles.card} onPress={() => nav.navigate(item.screen as any)} activeOpacity={0.8}>
              <View style={[styles.iconBg, { backgroundColor: item.color + '18' }]}>
                <MaterialCommunityIcons name={item.icon as any} size={32} color={item.color} />
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.base }}>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Text style={styles.cardDesc}>{item.desc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          </AnimatedEntrance>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.outline,
    ...Shadow.sm,
  },
  iconBg: { width: 56, height: 56, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  cardDesc: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
});
