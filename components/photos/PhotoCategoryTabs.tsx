import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import {
  getPhotoCategoryLabel,
  PHOTO_LIMIT_PER_CATEGORY,
  photoCategories,
} from '../../lib/photoCategories';
import type { PhotoCategory } from '../../types/photos';

type PhotoCategoryTabsProps = {
  selectedCategory: PhotoCategory;
  onSelectCategory: (category: PhotoCategory) => void;
  counts: Record<PhotoCategory, number>;
};

export function PhotoCategoryTabs({
  selectedCategory,
  onSelectCategory,
  counts,
}: PhotoCategoryTabsProps) {
  return (
    <View style={styles.container}>
      {photoCategories.map((category) => {
        const selected = category === selectedCategory;

        return (
          <Pressable
            key={category}
            style={[styles.tab, selected ? styles.tabSelected : null]}
            onPress={() => onSelectCategory(category)}
            accessibilityRole="button"
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>
              {getPhotoCategoryLabel(category)} · {counts[category] ?? 0} de{' '}
              {PHOTO_LIMIT_PER_CATEGORY}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  tabSelected: {
    backgroundColor: colors.background,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  label: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  labelSelected: {
    color: colors.text,
  },
});
