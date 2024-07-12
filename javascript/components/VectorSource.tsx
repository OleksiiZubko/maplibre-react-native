import {FilterExpression} from '../utils/MaplibreStyles';
import {cloneReactChildrenWithProps, isFunction, isAndroid} from '../utils';
import {getFilter} from '../utils/filterUtils';
import {copyPropertiesAsDeprecated} from '../utils/deprecation';
import BaseProps from '../types/BaseProps';
import OnPressEvent from '../types/OnPressEvent';
import useAbstractSource from '../hooks/useAbstractSource';
import useNativeBridge from '../hooks/useNativeBridge';

import React, {memo, useImperativeHandle} from 'react';
import {
  NativeModules,
  NativeSyntheticEvent,
  requireNativeComponent,
} from 'react-native';
import {featureCollection} from '@turf/helpers';

const MapLibreGL = NativeModules.MLNModule;

export const NATIVE_MODULE_NAME = 'RCTMLNVectorSource';

interface VectorSourceProps extends BaseProps {
  /**
   * A string that uniquely identifies the source.
   */
  id: string;
  /**
   * A URL to a TileJSON configuration file describing the source’s contents and other metadata.
   */
  url?: string;
  /**
   * An array of tile URL templates. If multiple endpoints are specified, clients may use any combination of endpoints.
   * Example: https://example.com/vector-tiles/{z}/{x}/{y}.pbf
   */
  tileUrlTemplates?: string[];
  /**
   * An unsigned integer that specifies the minimum zoom level at which to display tiles from the source.
   * The value should be between 0 and 22, inclusive, and less than
   * maxZoomLevel, if specified. The default value for this option is 0.
   */
  minZoomLevel?: number;
  /**
   * An unsigned integer that specifies the maximum zoom level at which to display tiles from the source.
   * The value should be between 0 and 22, inclusive, and less than
   * minZoomLevel, if specified. The default value for this option is 22.
   */
  maxZoomLevel?: number;
  /**
   * Influences the y direction of the tile coordinates. (tms inverts y axis)
   */
  tms?: boolean;
  /**
   * An HTML or literal text string defining the buttons to be displayed in an action sheet when the
   * source is part of a map view’s style and the map view’s attribution button is pressed.
   */
  attribution?: string;
  /**
   * Source press listener, gets called when a user presses one of the children layers only
   * if that layer has a higher z-index than another source layers
   *
   * @param {Object} event
   * @param {Object[]} event.features - the geojson features that have hit by the press (might be multiple)
   * @param {Object} event.coordinates - the coordinates of the click
   * @param {Object} event.point - the point of the click
   */
  onPress?: (event: OnPressEvent) => void;
  /**
   * Overrides the default touch hitbox(44x44 pixels) for the source layers
   */
  hitbox?: {
    /**
     * `width` of hitbox
     */
    width: number;
    /**
     * `height` of hitbox
     */
    height: number;
  };

  children?: React.ReactElement | React.ReactElement[];
}

type NativeProps = VectorSourceProps;

const RCTMLNVectorSource =
  requireNativeComponent<VectorSourceProps>(NATIVE_MODULE_NAME);

/**
 * VectorSource is a map content source that supplies tiled vector data in Mapbox Vector Tile format to be shown on the map.
 * The location of and metadata about the tiles are defined either by an option dictionary or by an external file that conforms to the TileJSON specification.
 */
const VectorSource = memo(
  React.forwardRef(
    (
      {
        id = MapLibreGL.StyleSource.DefaultSourceID,
        ...props
      }: VectorSourceProps,
      ref,
    ) => {
      // * exposes the methods of the function component so we don't break projects that depend on calling this methods
      useImperativeHandle(ref, () => ({
        /**
         * Returns all features that match the query parameters regardless of whether or not the feature is
         * currently rendered on the map. The domain of the query includes all currently-loaded vector tiles
         * and GeoJSON source tiles. This function does not check tiles outside of the visible viewport.
         *
         * @example
         * vectorSource.features(['id1', 'id2'])
         *
         * @param  {Array=} layerIDs - A set of strings that correspond to the names of layers defined in the current style. Only the features contained in these layers are included in the returned array.
         * @param  {Array=} filter - an optional filter statement to filter the returned Features.
         * @return {GeoJSON.FeatureCollection}
         */
        features,
        onPress,
      }));

      const {
        _runNativeCommand,
        //  _runPendingNativeCommands,
        _onAndroidCallback,
      } = useNativeBridge(NATIVE_MODULE_NAME);
      const {setNativeRef, _nativeRef} = useAbstractSource<NativeProps>();

      // const _setNativeRef = (
      //   nativeRef: (Component<NativeProps> & Readonly<NativeMethods>) | null,
      // ): void => {
      //   if (nativeRef) {
      //     setNativeRef(nativeRef);
      //     _runPendingNativeCommands(nativeRef);
      //   }
      // };

      const features = async (
        layerIDs = [],
        filter?: FilterExpression,
      ): Promise<GeoJSON.FeatureCollection> => {
        if (!_nativeRef) {
          return featureCollection([]);
        }
        const res: {data: string | GeoJSON.FeatureCollection} =
          await _runNativeCommand('features', _nativeRef, [
            [[layerIDs, getFilter(filter)]],
          ]);

        if (isAndroid()) {
          return JSON.parse(res?.data as string);
        }

        return res.data as GeoJSON.FeatureCollection;
      };

      const onPress = (
        event: NativeSyntheticEvent<{payload: OnPressEvent}>,
      ): void => {
        const {onPress} = props;

        if (!onPress) {
          return;
        }
        const {
          nativeEvent: {
            payload: {features, coordinates, point},
          },
        } = event;
        let newEvent = {
          features,
          coordinates,
          point,
        };
        newEvent = copyPropertiesAsDeprecated(
          event,
          newEvent,
          (key: string) => {
            console.warn(
              `event.${key} is deprecated on VectorSource#onPress, please use event.features`,
            );
          },
          {
            nativeEvent: (origNativeEvent: OnPressEvent) => ({
              ...origNativeEvent,
              payload: features[0],
            }),
          },
        );

        onPress(newEvent);
      };

      const allProps = {
        id,
        url: props.url,
        tileUrlTemplates: props.tileUrlTemplates,
        minZoomLevel: props.minZoomLevel,
        maxZoomLevel: props.maxZoomLevel,
        tms: props.tms,
        attribution: props.attribution,
        hitbox: props.hitbox,
        hasPressListener: isFunction(props.onPress),
        onMapboxVectorSourcePress: onPress,
        onPress: undefined,
        onAndroidCallback: isAndroid() ? _onAndroidCallback : undefined,
      };

      return (
        <RCTMLNVectorSource ref={setNativeRef} {...allProps}>
          {cloneReactChildrenWithProps(props.children, {
            sourceID: id,
          })}
        </RCTMLNVectorSource>
      );
    },
  ),
);

export default VectorSource;
