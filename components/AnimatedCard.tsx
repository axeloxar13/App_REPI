// components/AnimatedCard.tsx
import React, { useEffect, useRef, ReactNode } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type AnimationType = 
  | 'fade' 
  | 'slideUp' 
  | 'slideDown' 
  | 'scale' 
  | 'bounce'
  | 'none';

type AnimatedCardProps = {
  children: ReactNode;
  animation?: AnimationType;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
  onPress?: () => void;
  disabled?: boolean;
  elevation?: number;
  borderRadius?: number;
  padding?: number;
};

export function AnimatedCard({
  children,
  animation = 'slideUp',
  delay = 0,
  duration = 400,
  style,
  onPress,
  disabled = false,
  elevation = 2,
  borderRadius = 12,
  padding = 16,
}: AnimatedCardProps) {
  const { colors, isDark } = useTheme();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const getAnimation = () => {
    switch (animation) {
      case 'fade':
        return { opacity: fadeAnim, transform: [] };
      case 'slideUp':
        return { opacity: fadeAnim, transform: [{ translateY: slideAnim }] };
      case 'slideDown':
        return { opacity: fadeAnim, transform: [{ translateY: slideAnim }] };
      case 'scale':
        return { opacity: fadeAnim, transform: [{ scale: scaleAnim }] };
      case 'bounce':
        return {
          opacity: fadeAnim,
          transform: [
            { scale: bounceAnim.interpolate({
                inputRange: [0, 0.3, 0.6, 1],
                outputRange: [0.8, 1.05, 0.95, 1],
              }) 
            },
          ],
        };
      case 'none':
      default:
        return { opacity: 1, transform: [] };
    }
  };

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number, config?: any) => {
      return Animated.timing(value, {
        toValue,
        duration: duration,
        delay: delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        ...config,
      });
    };

    const animations: Animated.CompositeAnimation[] = [];

    if (animation !== 'none') {
      animations.push(timing(fadeAnim, 1));
    }

    switch (animation) {
      case 'slideUp':
        animations.push(timing(slideAnim, 0));
        break;
      case 'slideDown':
        animations.push(timing(slideAnim, 0));
        break;
      case 'scale':
        animations.push(timing(scaleAnim, 1));
        break;
      case 'bounce':
        animations.push(timing(bounceAnim, 1, { easing: Easing.elastic(1) }));
        break;
      default:
        break;
    }

    Animated.parallel(animations).start();

    return () => {
      fadeAnim.stopAnimation();
      slideAnim.stopAnimation();
      scaleAnim.stopAnimation();
      bounceAnim.stopAnimation();
    };
  }, [animation, delay, duration]);

  const containerStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: borderRadius,
    padding: padding,
    shadowColor: isDark ? '#000' : '#000',
    shadowOffset: { width: 0, height: elevation },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: elevation * 2,
    elevation: elevation,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? colors.border : 'transparent',
    overflow: 'hidden',
  };

  const animatedStyle = getAnimation();

  const Wrapper = onPress ? Pressable : View;

  return (
    <Animated.View
      style={[containerStyle, animatedStyle, style]}
    >
      <Wrapper
        onPress={onPress}
        disabled={disabled}
        style={styles.wrapper}
      >
        {children}
      </Wrapper>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});