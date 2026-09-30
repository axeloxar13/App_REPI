import { StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

type SearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export function SearchInput({ value, onChangeText }: SearchInputProps) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Buscar instalación…"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        selectionColor={colors.primary}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  input: {
    minHeight: 46,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
  },
});
