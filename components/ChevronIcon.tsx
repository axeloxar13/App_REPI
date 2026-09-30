import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

type ChevronIconProps = {
  direction?: 'left' | 'right';
  color?: string;
  size?: number;
};

export function ChevronIcon({
  direction = 'right',
  color = colors.primary,
  size = 18,
}: ChevronIconProps) {
  const strokeSize = Math.round(size * 0.42);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.container, { width: size, height: size }]}
    >
      <View
        style={[
          styles.stroke,
          {
            width: strokeSize,
            height: strokeSize,
            borderColor: color,
            transform: [{ rotate: direction === 'right' ? '45deg' : '225deg' }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stroke: {
    borderRightWidth: 2,
    borderTopWidth: 2,
  },
});
