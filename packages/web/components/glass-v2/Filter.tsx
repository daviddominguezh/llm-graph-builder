'use client';

import { type MotionValue, motion, useMotionValueEvent, useTransform } from 'motion/react';
import React, { useRef } from 'react';

import { calculateDisplacementMap, calculateDisplacementMap2 } from './lib/displacementMap';
import { imageDataToUrl } from './lib/imageDataToUrl';
import { calculateMagnifyingDisplacementMap } from './lib/magnifyingDisplacement';
import { calculateRefractionSpecular } from './lib/specular';
import { CONVEX } from './lib/surfaceEquations';
import { getValueOrMotion } from './lib/useValueOrMotion';

type ValueOrMotion<T> = T | MotionValue<T>;

export type FilterProps = {
  id: string;
  withSvgWrapper?: boolean;
  scaleRatio?: MotionValue<number>;
  canvasWidth?: ValueOrMotion<number>;
  canvasHeight?: ValueOrMotion<number>;
  blur: ValueOrMotion<number>;
  width: ValueOrMotion<number>;
  height: ValueOrMotion<number>;
  radius: ValueOrMotion<number>;
  glassThickness: ValueOrMotion<number>;
  bezelWidth: ValueOrMotion<number>;
  refractiveIndex: ValueOrMotion<number>;
  specularOpacity: ValueOrMotion<number>;
  specularSaturation?: ValueOrMotion<number>;
  magnifyingScale?: ValueOrMotion<number>;
  colorScheme?: MotionValue<'light' | 'dark'>;
  dpr?: number;
  bezelHeightFn?: (x: number) => number;
};

const DARK_MATRIX = '0.9 0 0 0 -0.3 0 0.9 0 0 -0.3 0 0 0.9 0 -0.3 0 0 0 1 0';
const LIGHT_MATRIX = '1.03 0 0 0 0.2 0 1.03 0 0 0.2 0 0 1.03 0 0.2 0 0 0 1 0';

interface FeColorMatrixMVProps {
  in: string;
  type: 'matrix' | 'saturate';
  values: MotionValue<string>;
  result?: string;
}

function FeColorMatrixMV({ in: inAttr, type, values, result }: FeColorMatrixMVProps) {
  const ref = useRef<SVGFEColorMatrixElement | null>(null);
  useMotionValueEvent(values, 'change', (v) => {
    ref.current?.setAttribute('values', v);
  });
  return <feColorMatrix ref={ref} in={inAttr} type={type} values={values.get()} result={result} />;
}

export function Filter(props: FilterProps) {
  const {
    id,
    withSvgWrapper = true,
    scaleRatio,
    canvasWidth,
    canvasHeight,
    blur,
    width,
    height,
    radius,
    glassThickness,
    bezelWidth,
    refractiveIndex,
    specularOpacity,
    specularSaturation = 4,
    magnifyingScale,
    colorScheme,
    dpr,
    bezelHeightFn = CONVEX.fn,
  } = props;

  const map = useTransform(() =>
    calculateDisplacementMap(
      getValueOrMotion(glassThickness),
      getValueOrMotion(bezelWidth),
      bezelHeightFn,
      getValueOrMotion(refractiveIndex)
    )
  );

  const maximumDisplacement = useTransform(() => {
    const arr = map.get();
    let max = 0;
    for (const v of arr) {
      const abs = Math.abs(v);
      if (abs > max) {
        max = abs;
      }
    }
    return max;
  });

  const displacementMap = useTransform(() =>
    calculateDisplacementMap2(
      getValueOrMotion(canvasWidth ?? width),
      getValueOrMotion(canvasHeight ?? height),
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      getValueOrMotion(bezelWidth),
      maximumDisplacement.get(),
      map.get(),
      dpr
    )
  );

  const specularLayer = useTransform(() =>
    calculateRefractionSpecular(
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      50,
      undefined,
      dpr
    )
  );

  const magnifyingMap = useTransform(() =>
    magnifyingScale !== undefined
      ? calculateMagnifyingDisplacementMap(
          getValueOrMotion(canvasWidth ?? width),
          getValueOrMotion(canvasHeight ?? height)
        )
      : null
  );

  const magnifyingMapUrl = useTransform(() => {
    const m = magnifyingMap.get();
    return m ? imageDataToUrl(m) : '';
  });
  const displacementMapUrl = useTransform(() => imageDataToUrl(displacementMap.get()));
  const specularLayerUrl = useTransform(() => imageDataToUrl(specularLayer.get()));
  const scale = useTransform(() => maximumDisplacement.get() * (scaleRatio?.get() ?? 1));

  const matrixValues = useTransform((): string => {
    if (!colorScheme) {
      return LIGHT_MATRIX;
    }
    return getValueOrMotion(colorScheme) === 'dark' ? DARK_MATRIX : LIGHT_MATRIX;
  });

  const specularSaturationStr = useTransform(() => getValueOrMotion(specularSaturation).toString());
  const specularSlope = useTransform(() => getValueOrMotion(specularOpacity));

  const hasMagnifying = magnifyingScale !== undefined;
  const blurInput = colorScheme ? 'brightened_source' : hasMagnifying ? 'magnified_source' : 'SourceGraphic';
  const colorMatrixIn = hasMagnifying ? 'magnified_source' : 'SourceGraphic';
  const filterWidth = canvasWidth ?? width;
  const filterHeight = canvasHeight ?? height;

  const filter = (
    <filter id={id}>
      {hasMagnifying ? (
        <>
          <motion.feImage
            href={magnifyingMapUrl}
            x={0}
            y={0}
            width={filterWidth}
            height={filterHeight}
            result="magnifying_displacement_map"
          />
          <motion.feDisplacementMap
            in="SourceGraphic"
            in2="magnifying_displacement_map"
            scale={magnifyingScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="magnified_source"
          />
        </>
      ) : null}

      {colorScheme ? (
        <FeColorMatrixMV in={colorMatrixIn} type="matrix" values={matrixValues} result="brightened_source" />
      ) : null}

      <motion.feGaussianBlur in={blurInput} stdDeviation={blur} result="blurred_source" />

      <motion.feImage
        href={displacementMapUrl}
        x={0}
        y={0}
        width={filterWidth}
        height={filterHeight}
        result="displacement_map"
      />

      <motion.feDisplacementMap
        in="blurred_source"
        in2="displacement_map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="displaced"
      />

      <FeColorMatrixMV
        in="displaced"
        type="saturate"
        values={specularSaturationStr}
        result="displaced_saturated"
      />

      <motion.feImage
        href={specularLayerUrl}
        x={0}
        y={0}
        width={filterWidth}
        height={filterHeight}
        result="specular_layer"
      />

      <feComposite in="displaced_saturated" in2="specular_layer" operator="in" result="specular_saturated" />

      <feComponentTransfer in="specular_layer" result="specular_faded">
        <motion.feFuncA type="linear" slope={specularSlope} />
      </feComponentTransfer>

      <motion.feBlend in="specular_saturated" in2="displaced" mode="normal" result="withSaturation" />
      <motion.feBlend in="specular_faded" in2="withSaturation" mode="normal" />
    </filter>
  );

  if (!withSvgWrapper) {
    return filter;
  }
  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: 'none' }} aria-hidden="true">
      <defs>{filter}</defs>
    </svg>
  );
}
