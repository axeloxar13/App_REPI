import { StyleSheet, Text, View } from 'react-native';
import { installationStatusConfig } from '../lib/installationStatus';
import type { InstallationStatus } from '../types/database';

type InstallationStatusBadgeProps = {
  status: InstallationStatus;
};

export function InstallationStatusBadge({ status }: InstallationStatusBadgeProps) {
  const config = installationStatusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.backgroundColor }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
});
