import React, { useMemo } from 'react';
import { Text, StyleProp, TextStyle, StyleSheet } from 'react-native';
import { findRanges } from '../utils/search';

type Props = {
  text?: string | null;
  terms: string[];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function HighlightedText({ text, terms, style, numberOfLines }: Props) {
  const value = text ?? '';
  const ranges = useMemo(() => findRanges(value, terms), [value, terms]);

  if (!ranges.length) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {value}
      </Text>
    );
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(value.slice(cursor, start));
    parts.push(
      <Text key={i} style={styles.highlight}>
        {value.slice(start, end)}
      </Text>
    );
    cursor = end;
  });
  if (cursor < value.length) parts.push(value.slice(cursor));

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts}
    </Text>
  );
}

const styles = StyleSheet.create({
  highlight: {
    backgroundColor: '#FEF08A',
    color: '#713F12',
    fontWeight: '700',
  },
});