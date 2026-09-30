import { Image, StyleSheet, Text, View } from 'react-native';
import { taminLogo } from '../constants/assets';
import { colors, spacing } from '../constants/theme';

type LogoHeaderProps = {
  title?: string;
  subtitle?: string;
  logoSize?: 'compact' | 'regular' | 'large' | 'splash';
};

export function LogoHeader({ title, subtitle, logoSize = 'regular' }: LogoHeaderProps) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.logoFrame,
          logoSize === 'compact' && styles.logoFrameCompact,
          logoSize === 'large' && styles.logoFrameLarge,
          logoSize === 'splash' && styles.logoFrameSplash,
        ]}
      >
        <Image
          source={taminLogo}
          style={[
            styles.logo,
            logoSize === 'compact' && styles.logoCompact,
            logoSize === 'large' && styles.logoLarge,
            logoSize === 'splash' && styles.logoSplash,
          ]}
          resizeMode="contain"
        />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 124,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  logoFrameCompact: {
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
  },
  logoFrameLarge: {
    maxWidth: 430,
    minHeight: 144,
  },
  logoFrameSplash: {
    maxWidth: 460,
    minHeight: 160,
    paddingHorizontal: spacing.md,
  },
  logo: {
    width: '100%',
    height: 108,
  },
  logoCompact: {
    height: 44,
  },
  logoLarge: {
    height: 132,
  },
  logoSplash: {
    height: 148,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
