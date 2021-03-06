/**
 * VECTORS, GEOJSON & AJAX LAYERS
 */
/**
 * Compute a style from different styles
 * return ol.style.Style containing each style component or ol default
 */
function escapedStyle(a, b, c) {
	//BEST work with arguments
	const defaultStyle = new ol.layer.Vector().getStyleFunction()()[0];
	return function(feature) {
		return new ol.style.Style(Object.assign({
				fill: defaultStyle.getFill(),
				stroke: defaultStyle.getStroke(),
				image: defaultStyle.getImage(),
			},
			typeof a == 'function' ? a(feature.getProperties()) : a,
			typeof b == 'function' ? b(feature.getProperties()) : b,
			typeof c == 'function' ? c(feature.getProperties()) : c
		));
	};
}

/**
 * Gives list of checkboxes inputs states having the same name
 * selectorName {string}
 * if an input witout value is clicked, copy the check in all other inputs having the same name (click "all")
 * return : array of values of all checked <input name="selectorName" type="checkbox" value="xxx" />
 */
function permanentCheckboxList(selectorName) {
	const inputEls = document.getElementsByName(selectorName),
		list = [];

	for (let e = 0; e < inputEls.length; e++) //HACK el.forEach is not supported by IE/Edge
		// Get the values of all checked inputs
		if (inputEls[e].value && // Only if a value is assigned
			inputEls[e].checked) // List checked elements
			list.push(inputEls[e].value);

	return list;
}

/**
 * Manages checkboxes inputs having the same name
 * selectorName {string}
 * callback {function} action when the button is clicked
 * options.init {string} default cookie value
 * options.noMemSelection {bool} do(default)/don't(if true) mem state in a cookie
 */
function controlPermanentCheckbox(selectorName, callback, options) {
	options = options || {};

	// Search values in cookies
	const inputEls = document.getElementsByName(selectorName),
		cooks = [
			location.search, // Priority to the url args
			location.hash, // Then the hash
			document.cookie, // Then the cookies
			selectorName + '=' + (options.init || ''), // Then the default
		];
	let found = false;
	for (let c in cooks) {
		const match = cooks[c].match(selectorName + '=([^#&;]*)');
		if (!found && match && !options.noMemSelection)
			// Set the <input> checks accordingly with the cookie
			for (let e = 0; e < inputEls.length; e++) //HACK el.forEach is not supported by IE/Edge
				if (match[1].split(',').indexOf(inputEls[e].value) !== -1)
					found = inputEls[e].checked = true;
	}

	// Attach the action
	for (let e = 0; e < inputEls.length; e++)
		inputEls[e].addEventListener('click', onClick);

	function onClick(evt) {
		const list = permanentCheckboxList(selectorName);
		callback(evt, list);
	}

	// Call callback once at the init to draw the layer
	callback(null, permanentCheckboxList(selectorName));
}

/**
 * Manages a feature hovering common to all features & layers
 * Requires escapedStyle
 */
//TODO BUG no label when Modify mode
//TODO no click if one editor mode active
function hoverManager(map) {
	if (map.hasHoverManager_)
		return; // Only one per map
	else
		map.hasHoverManager_ = true; //BEST make it reentrant (for several maps)

	let hoveredFeature = null;
	const labelEl = document.createElement('div'),
		viewStyle = map.getViewport().style,
		popup = new ol.Overlay({
			element: labelEl,
		});
	labelEl.id = 'label';
	map.addOverlay(popup);

	function findClosestFeature(pixel) {
		let closestFeature = null,
			distanceMin = 2000;

		map.forEachFeatureAtPixel(
			pixel,
			function(feature, layer) {
				if (layer) {
					let geometry = feature.getGeometry(),
						featurePixel = map.getPixelFromCoordinate(
							geometry.getExtent()
						),
						distance = Math.hypot( // Distance of a point
							featurePixel[0] - pixel[0] + 1 / feature.ol_uid, // Randomize to avoid same location features
							featurePixel[1] - pixel[1]
						),
						geomEextent = geometry.getExtent();

					// Higest priority for draggable markers
					if (feature.getProperties().draggable)
						distance = 0;

					if (geomEextent[0] != geomEextent[2]) { // Line or polygon
						distance = 1000; // Lower priority
						featurePixel = pixel; // Label follows the cursor
					}
					if (distanceMin > distance) {
						distanceMin = distance;

						// Look at hovered feature
						closestFeature = feature;
						closestFeature.pixel_ = featurePixel;
						closestFeature.layer_ = layer;
					}
				}
			}, {
				hitTolerance: 6,
			}
		);

		return closestFeature;
	}

	// Go to feature.property.link when click on the feature (icon or area)
	map.on('click', function(evt) {
		let clickedFeature = findClosestFeature(evt.pixel);
		if (clickedFeature) {
			const link = clickedFeature.getProperties().link,
				layerOptions = clickedFeature.layer_.options;

			if (link && !layerOptions.noClick) {
				if (evt.originalEvent.ctrlKey) {
					const tab = window.open(link, '_blank');
					if (evt.originalEvent.shiftKey)
						tab.focus();
				} else
					window.location = link;
			}
		}
	});

	//BEST appeler sur l'event "hover" (pour les mobiles)
	map.on('pointermove', function(evt) {
		const maprect = map.getTargetElement().getBoundingClientRect(),
			hoveredEl = document.elementFromPoint(
				evt.pixel[0] + maprect.left,
				evt.pixel[1] + maprect.top
			);

		if (hoveredEl && hoveredEl.tagName == 'CANVAS') { // Don't hover above the buttons & labels
			// Search hovered features
			let closestFeature = findClosestFeature(evt.pixel);

			if (closestFeature != hoveredFeature) { // If we hover a new feature
				// Recover the basic style for the previous hoveredFeature feature
				if (hoveredFeature && hoveredFeature.layer_.options)
					hoveredFeature.setStyle(
						escapedStyle(hoveredFeature.layer_.options.styleOptions)
					);
				hoveredFeature = closestFeature; // Mem for the next cursor move

				if (!closestFeature) {
					// Default cursor & label
					viewStyle.cursor = 'default';
					labelEl.className = 'myol-popup-hidden';
				} else {
					const properties = closestFeature.getProperties(),
						layerOptions = closestFeature.layer_.options;

					if (layerOptions) {
						// Set the hovered style
						closestFeature.setStyle(escapedStyle(
							layerOptions.styleOptions,
							layerOptions.hoverStyleOptions,
							layerOptions.editStyleOptions
						));

						// Set the text
						if (typeof layerOptions.label == 'function')
							labelEl.innerHTML = layerOptions.label(properties, closestFeature, layerOptions);
						else if (layerOptions.label)
							labelEl.innerHTML = layerOptions.label;
						else
							labelEl.innerHTML = null;
						if (labelEl.innerHTML) // To avoid tinny popup when nothing to display
							labelEl.className = 'myol-popup';
					}
					// Change the cursor
					if (properties.link && !layerOptions.noClick)
						viewStyle.cursor = 'pointer';
					if (properties.draggable)
						viewStyle.cursor = 'move';
				}
			}
			// Position & reposition the label
			if (closestFeature) {
				//HACK set the label position in the middle to measure the label extent
				popup.setPosition(map.getView().getCenter());

				const pixel = closestFeature.pixel_;
				// Shift of the label to stay into the map regarding the pointer position
				if (pixel[1] < labelEl.clientHeight + 12) { // On the top of the map (not enough space for it)
					pixel[0] += pixel[0] < map.getSize()[0] / 2 ? 10 : -labelEl.clientWidth - 10;
					pixel[1] = 2;
				} else {
					pixel[0] -= labelEl.clientWidth / 2;
					pixel[0] = Math.max(pixel[0], 0); // Left edge
					pixel[0] = Math.min(pixel[0], map.getSize()[0] - labelEl.clientWidth - 1); // Right edge
					pixel[1] -= labelEl.clientHeight + 8;
				}
				popup.setPosition(map.getCoordinateFromPixel(pixel));
			}
		}
	});

	// Hide popup when the cursor is out of the map
	window.addEventListener('mousemove', function(evt) {
		const divRect = map.getTargetElement().getBoundingClientRect();
		if (evt.clientX < divRect.left || evt.clientX > divRect.right ||
			evt.clientY < divRect.top || evt.clientY > divRect.bottom)
			labelEl.className = 'myol-popup-hidden';
	});
}


/**
 * BBOX strategy when the url returns a limited number of features depending on the extent
 */
ol.loadingstrategy.bboxLimit = function(extent, resolution) {
	if (this.bboxLimitResolution > resolution) // When zoom in
		this.loadedExtentsRtree_.clear(); // Force the loading of all areas
	this.bboxLimitResolution = resolution; // Mem resolution for further requests
	return [extent];
};

/**
 * GeoJson POI layer
 * Requires JSONparse, myol:onadd, escapedStyle, hoverManager,
 * permanentCheckboxList, controlPermanentCheckbox, ol.loadingstrategy.bboxLimit
 */
function layerVectorURL(options) {
	options = Object.assign({
		/** All ol.source.Vector options */
		/** All ol.layer.Vector options */
		// baseUrl: url of the service (mandatory)
		// strategy: ol.loadingstrategy... object
		urlSuffix: '', // url suffix to be defined separately from the rest (E.G. server domain and/or directory)
		// noMemSelection: don't memorize the selection in cookies
		selectorName: '', // Id of a <select> to tune url optional parameters

		//TODO DELETE (only used in overpass)
		baseUrlFunction: function(bbox, list) { // Function returning the layer's url
			return options.baseUrl + options.urlSuffix +
				list.join(',') +
				(bbox ? '&bbox=' + bbox.join(',') : ''); // Default most common url format
		},

		url: function(extent, resolution, projection) {
			// Retreive checked parameters
			let list = permanentCheckboxList(options.selectorName).filter(
					function(evt) {
						return evt !== 'on'; // Except the "all" input (default value = "on")
					}),
				bbox = null;

			if (ol.extent.getWidth(extent) != Infinity) {
				bbox = ol.proj.transformExtent(
					extent,
					projection.getCode(),
					options.projection
				);
				// Round the coordinates
				for (let b in bbox)
					bbox[b] = (Math.ceil(bbox[b] * 10000) + (b < 2 ? 0 : 1)) / 10000;
			}
			return options.baseUrlFunction(bbox, list, resolution);
		},
		projection: 'EPSG:4326', // Projection of received data
		format: new ol.format.GeoJSON({ // Format of received data
			dataProjection: options.projection,
		}),
		receiveProperties: function() {}, // (properties, feature, layer) Add properties based on existing one
		receiveFeatures: function(features) { // Features pre-treatment
			return features;
		},
		styleOptions: function(properties) { // Default function returning the layer's feature style
			if (!properties.icon)
				//TODO trouver plus standard
				properties.icon = '//chemineur.fr/ext/Dominique92/GeoBB/icones/' + (properties.sym || 'Puzzle Cache') + '.png';

			return {
				image: new ol.style.Icon({
					src: properties.icon,
					imgSize: [24, 24], // C'est le param??tre miracle qui permet d'afficher des .SVG sur I.E.
					//TODO d??tecter la taille automatiquement
				}),
				stroke: new ol.style.Stroke({
					color: 'blue',
					width: 2,
				}),
			};
		},
		hoverStyleOptions: {
			stroke: new ol.style.Stroke({ // For lines & polygons
				color: '#4444ff',
				width: 4,
			})
		},
		label: function(properties) { // Label to dispach above the feature when hovering
			const lines = [],
				desc = [],
				type = (typeof properties.type == 'string' ? properties.type : '')
				.replace(/(:|_)/g, ' ') // Remove overpass prefix
				.replace(/[a-z]/, function(c) { // First char uppercase
					return c.toUpperCase();
				}),
				src = (properties.link || '').match(/\/([^\/]+)/i);

			if (properties.name) {
				if (properties.link)
					lines.push('<a href="' + properties.link + '">' + properties.name + '</a>');
				else
					lines.push(properties.name);
				if (type)
					lines.push(type);
			} else {
				if (properties.link)
					lines.push('<a href="' + properties.link + '">' + (type || 'Fiche') + '</a>');
				else if (type)
					lines.push(type);
			}
			if (properties.ele)
				desc.push(properties.ele + 'm');
			if (properties.bed)
				desc.push(properties.bed + '<span>\u255E\u2550\u2555</span>');
			if (desc.length)
				lines.push(desc.join(', '));
			if (properties.phone)
				lines.push('<a href="tel:' + properties.phone.replace(/ /g, '') + '">' + properties.phone + '</a>');
			if (options.copyDomain && typeof properties.copy != 'string' && src)
				properties.copy = src[1];
			if (properties.copy)
				lines.push('<p>&copy; ' + properties.copy.replace('www.', '') + '</p>');

			return lines.join('<br/>');
		},
	}, options);

	const statusEl = document.getElementById(options.selectorName + '-status') || {},
		xhr = new XMLHttpRequest(), // Only one object created
		source = new ol.source.Vector(Object.assign({
			loader: function(extent, resolution, projection) {
				const url = typeof options.url === 'function' ?
					options.url(extent, resolution, projection) :
					options.url;
				xhr.abort(); // Abort previous requests if any
				xhr.open('GET', url, true);
				xhr.onreadystatechange = function() {
					if (xhr.readyState < 4)
						statusEl.innerHTML = 'chargement';
				};
				xhr.onload = function() {
					if (xhr.status != 200)
						statusEl.innerHTML = 'erreur: ' + xhr.status + ' ' + xhr.statusText;
					else {
						if (options.strategy == ol.loadingstrategy.bboxLimit) // If we can have more features when zomming in
							source.clear(); // Clean all features when receiving a request

						const error = xhr.responseText.match(/error: ([^\.]+)/);
						if (!xhr.responseText)
							statusEl.innerHTML = 'erreur: r??ponse vide';
						else if (error) // Error log ini the text response
							statusEl.innerHTML = 'erreur: ' + error[1];
						else {
							const features = options.format.readFeatures(
								xhr.responseText, {
									extent: extent,
									featureProjection: projection
								});
							if (!features.length)
								statusEl.innerHTML = 'zone vide';
							else {
								source.addFeatures(options.receiveFeatures(features));
								statusEl.innerHTML = features.length + ' objet' + (features.length > 1 ? 's' : '') + ' charg??' + (features.length > 1 ? 's' : '');

								// Zoom the map on the added features
								if (options.centerOnfeatures) {
									const extent = ol.extent.createEmpty(),
										mapSize = layer.map_.getSize();
									for (let f in features)
										ol.extent.extend(extent, features[f].getGeometry().getExtent());
									layer.map_.getView().fit(extent, {
										maxZoom: 17,
										size: [mapSize[0] * 0.8, mapSize[1] * 0.8],
									});
								}
							}
						}
					}
				};
				xhr.ontimeout = function() {
					statusEl.innerHTML = 'temps d??pass??';
				};
				xhr.onerror = function() {
					statusEl.innerHTML = 'erreur r??seau';
				};
				if (!options.maxResolution || (resolution < options.maxResolution)) {
					xhr.send();
					statusEl.innerHTML = 'demand??';
				}
			},
		}, options)),

		layer = new ol.layer.Vector(Object.assign({
			source: source,
			style: escapedStyle(options.styleOptions),
			renderBuffer: 16, // Buffered area around curent view (px)
			zIndex: 1, // Above the baselayer even if included to the map before
		}, options));

	layer.options = options; // Mem options for further use

	const formerFeadFeatureFromObject = options.format.readFeatureFromObject;
	if (formerFeadFeatureFromObject && // If format = GeoJSON
		options.receiveProperties) { // If receiveProperties options
		options.format.readFeatureFromObject = function(object, opt_options) {
			// Filter features after receiving
			const valid = options.receiveProperties(object.properties, object, layer);
			if (valid === false &&
				object.geometry && object.geometry.coordinates)
				object.geometry.coordinates[1] += 90; //TODO horrible : use filter function

			return formerFeadFeatureFromObject.call(this, object, opt_options);
		};
	}

	layer.once('myol:onadd', function(evt) {
		// Attach tracking for labeling & cursor changes
		hoverManager(evt.map);

		// Zoom out of range report
		evt.map.getView().on('change:resolution', displayZoomStatus);
		displayZoomStatus();

		// Checkboxes to tune layer parameters
		if (options.selectorName)
			memCheckbox(options.selectorName, function(list) {
				if (!list.length)
					xhr.abort();
				statusEl.innerHTML = '';
				layer.setVisible(list.length > 0);
				displayZoomStatus();
				if (list.length && source.loadedExtentsRtree_) {
					//TODO reset ?????????????????
					source.loadedExtentsRtree_.clear(); // Force the loading of all areas
					source.clear(); // Redraw the layer
				}
			});
	});

	// Change class indicator when zoom is OK
	function displayZoomStatus() {
		if (options.maxResolution &&
			layer.map_ &&
			layer.map_.getView().getResolution() > options.maxResolution) {
			xhr.abort(); // Abort previous requests if any
			if (layer.getVisible())
				statusEl.innerHTML = 'zone trop large: zoomez';
		}
	}
	return layer;
}

/**
 * Convert properties type into gpx <sym>
 * Manages common types for many layer services
 */
//BEST define <sym> in an input check field
function getSym(type) {
	const lex =
		// https://forums.geocaching.com/GC/index.php?/topic/277519-garmin-roadtrip-waypoint-symbols/
		// https://www.gerritspeek.nl/navigatie/gps-navigatie_waypoint-symbolen.html
		// <sym> propertie propertie
		'<City Hall> hotel' +
		'<Residence> refuge gite chambre_hote' +
		'<Lodge> cabane cabane_cle buron alpage shelter cabane ouverte mais ocupee par le berger l ete' +
		'<Fishing Hot Spot Facility> abri hut' +
		'<Campground> camping camp_site bivouac' +
		'<Tunnel> orri toue abri en pierre grotte cave' +
		'<Crossing> ferme ruine batiment-inutilisable cabane fermee' +

		'<Summit> sommet summit climbing_indoor climbing_outdoor bisse' +
		'<Reef> glacier canyon' +
		'<Waypoint> locality col pass' +

		'<Drinking Water> point_eau waterpoint waterfall' +
		'<Water Source> lac lake' +
		'<Ground Transportation> bus car' +
		'<Parking Area> access' +
		'<Restaurant> buffet restaurant' +
		'<Shopping Center> local_product ravitaillement' +

		'<Restroom> wc' +
		'<Oil Field> wifi reseau' +
		'<Telephone> telephone',
		// slackline_spot paragliding_takeoff paragliding_landing virtual webcam

		match = lex.match(new RegExp('<([^>]*)>[^>]* ' + type));
	return match ? match[1] : 'Puzzle Cache';
}

/**
 * www.refuges.info POI layer
 * Requires ol.loadingstrategy.bboxLimit, layerVectorURL
 */
function layerRefugesInfo(options) {
	options = Object.assign({
		baseUrl: '//www.refuges.info/',
		urlSuffix: 'api/bbox?type_points=',
		strategy: ol.loadingstrategy.bboxLimit,
		receiveProperties: function(properties) {
			properties.name = properties.nom;
			properties.link = properties.lien;
			properties.ele = properties.coord.alt;
			properties.icon = options.baseUrl + 'images/icones/' + properties.type.icone + '.svg';
			properties.type = properties.type.valeur;
			properties.bed = properties.places.valeur;
			// Need to have clean KML export
			properties.nom =
				properties.lien =
				properties.date = '';
		},
	}, options);
	return layerVectorURL(options);
}

/**
 * pyrenees-refuges.com POI layer
 * Requires layerVectorURL, getSym
 */
function layerPyreneesRefuges(options) {
	return layerVectorURL(Object.assign({
		url: 'https://www.pyrenees-refuges.com/api.php?type_fichier=GEOJSON',
		receiveProperties: function(properties, object, layer) {
			properties.sym = getSym(properties.type_hebergement || 'cabane');
			properties.link = properties.url;
			properties.ele = parseInt(properties.altitude);
			properties.type = properties.type_hebergement;
			properties.bed = properties.cap_ete || properties.cap_hiver;

			const list = permanentCheckboxList(layer.options.selectorName);
			return list.includes(properties.sym);
		},
	}, options));
}

/**
 * chemineur.fr POI layer
 * Requires ol.loadingstrategy.bboxLimit, layerVectorURL, getSym
 */
function layerChemineur(options) {
	return layerVectorURL(Object.assign({
		baseUrl: '//chemineur.fr/',
		urlSuffix: 'ext/Dominique92/GeoBB/gis.php?cat=',
		strategy: ol.loadingstrategy.bboxLimit,
		receiveProperties: function(properties) {
			properties.copy = 'chemineur.fr';
		},
	}, options));
}

/**
 * alpages.info POI layer
 * Requires ol.loadingstrategy.bboxLimit, layerVectorURL, getSym, layerChemineur
 */
function layerAlpages(options) {
	return layerChemineur(Object.assign({
		baseUrl: '//alpages.info/',
		urlSuffix: 'ext/Dominique92/GeoBB/gis.php?forums=',
		receiveProperties: function(properties) {
			if (properties.icon) {
				const icone = properties.icon.match(new RegExp('([a-z\-_]+)\.png')); //TODO se passer de RegExp
				properties.type = icone ? icone[1] : null;
			}
			properties.sym = getSym(properties.icone);
			properties.link = 'http://alpages.info/viewtopic.php?t=' + properties.id;
		},
	}, options));
}

/**
 * www.camptocamp.org POI layer
 * Requires JSONparse, ol.loadingstrategy.bboxLimit, layerVectorURL, getSym
 */
function layerC2C(options) {
	const format = new ol.format.GeoJSON({ // Format of received data
		dataProjection: 'EPSG:3857',
	});
	format.readFeatures = function(json, opts) {
		const features = [],
			objects = JSONparse(json);
		for (let o in objects.documents) {
			const object = objects.documents[o];
			features.push({
				id: object.document_id,
				type: 'Feature',
				geometry: JSONparse(object.geometry.geom),
				properties: {
					ele: object.elevation,
					name: object.locales[0].title,
					type: object.waypoint_type,
					sym: getSym(object.waypoint_type),
					link: 'https://www.camptocamp.org/waypoints/' + object.document_id,
				},
			});
		}
		return format.readFeaturesFromObject({
				type: 'FeatureCollection',
				features: features,
			},
			format.getReadOptions(json, opts)
		);
	};

	return layerVectorURL(Object.assign({
		baseUrl: 'https://api.camptocamp.org/waypoints?limit=100', // https mandatory for Access-Control-Allow-Origin
		strategy: ol.loadingstrategy.bboxLimit,
		projection: 'EPSG:3857',
		format: format,
	}, options));
}

/**
 * OSM overpass POI layer
 * From: https://openlayers.org/en/latest/examples/vector-osm.html
 * Doc: http://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
 * Requires layerVectorURL
 */
//BUG IE don't display icons
function layerOverpass(options) {
	options = Object.assign({
		baseUrl: '//overpass-api.de/api/interpreter',
		maxResolution: 30, // Only call overpass if the map's resolution is lower
	}, options);

	const inputEls = document.getElementsByName(options.selectorName),
		format = new ol.format.OSMXML(),
		layer = layerVectorURL(Object.assign({
			strategy: ol.loadingstrategy.bbox,
			format: format,
			baseUrlFunction: urlFunction,
		}, options));

	function urlFunction(bbox, list) {
		const bb = '(' + bbox[1] + ',' + bbox[0] + ',' + bbox[3] + ',' + bbox[2] + ');',
			args = [];

		for (let l = 0; l < list.length; l++) {
			const lists = list[l].split('+');
			for (let ls = 0; ls < lists.length; ls++)
				args.push(
					'node' + lists[ls] + bb + // Ask for nodes in the bbox
					'way' + lists[ls] + bb // Also ask for areas
				);
		}
		return options.baseUrl +
			'?data=[timeout:5];(' + // Not too much !
			args.join('') +
			');out center;'; // add center of areas
	}

	// Extract features from data when received
	format.readFeatures = function(response, opt) {
		// Transform an area to a node (picto) at the center of this area
		const doc = new DOMParser().parseFromString(response, 'application/xml');
		for (let node = doc.documentElement.firstElementChild; node; node = node.nextSibling)
			if (node.nodeName == 'way') {
				// Create a new 'node' element centered on the surface
				const newNode = doc.createElement('node');
				newNode.id = node.id;
				doc.documentElement.appendChild(newNode);

				// Browse <way> attributes to build a new node
				for (let subTagNode = node.firstElementChild; subTagNode; subTagNode = subTagNode.nextSibling)
					switch (subTagNode.nodeName) {
						case 'center':
							// Set node attributes
							newNode.setAttribute('lon', subTagNode.getAttribute('lon'));
							newNode.setAttribute('lat', subTagNode.getAttribute('lat'));
							newNode.setAttribute('nodeName', subTagNode.nodeName);
							break;

						case 'tag': {
							// Get existing properties
							newNode.appendChild(subTagNode.cloneNode());

							// Add a tag to mem what node type it was (for link build)
							const newTag = doc.createElement('tag');
							newTag.setAttribute('k', 'nodetype');
							newTag.setAttribute('v', node.nodeName);
							newNode.appendChild(newTag);
						}
					}
			}

		// Call former method into OL
		const features = ol.format.OSMXML.prototype.readFeatures.call(this, doc, opt);

		// Compute missing features
		for (let f = features.length - 1; f >= 0; f--)
			if (!features[f].getId()) // Remove unused 'way' features
				features.splice(f, 1);
			else {
				const properties = features[f].getProperties(),
					newProperties = {
						sym: 'Puzzle Cache', // Default symbol
						link: 'http://www.openstreetmap.org/' + (properties.nodetype || 'node') + '/' + features[f].id_,
						copy: 'openstreetmap.org',
					};
				for (let p in properties)
					if (typeof properties[p] == 'string') { // Avoid geometry
						for (let c = 0; c < inputEls.length; c++)
							if (inputEls[c].value &&
								inputEls[c].value.includes(p) &&
								inputEls[c].value.includes(properties[p])) {
								newProperties.sym = inputEls[c].getAttribute('id');
								newProperties.type = properties[p];
							}
						features[f].setProperties(newProperties, false);
					}
			}
		return features;
	};

	return layer;
}

function overlaysCollection() {
	return {
		chemineur: layerChemineur(),
		'refuges.info': layerRefugesInfo(),
		'Pyrenees-Refuges.com': layerPyreneesRefuges(),
		CampToCamp: layerC2C(),
		OSM: layerOverpass(),
		Alpages: layerAlpages(),
	};
}


/**
 * CONTROLS
 */
/**
 * Control button
 * Abstract definition to be used by other control buttons definitions
 */
//BEST left aligned buttons when screen vertical
function controlButton(options) {
	options = Object.assign({
		element: document.createElement('div'),
		buttonBackgroundColors: ['white', 'white'], // Also define the button states numbers
		className: 'myol-button',
		activate: function() {}, // Call back when the button is clicked. Argument = satus number (0, 1, ...)
	}, options);
	const control = new ol.control.Control(options),
		buttonEl = document.createElement('button');

	control.element.className = 'ol-button ol-unselectable ol-control ' + options.className;
	control.element.title = options.title; // {string} displayed when the control is hovered.
	if (options.label)
		buttonEl.innerHTML = options.label;
	if (options.label !== null)
		control.element.appendChild(buttonEl);

	buttonEl.addEventListener('click', function(evt) {
		evt.preventDefault();
		control.toggle();
	});

	// Add selectors below the button
	if (options.question) {
		control.questionEl = document.createElement('div');
		control.questionEl.innerHTML = options.question;
		control.questionEl.className = 'ol-control-hidden';

		control.element.appendChild(control.questionEl);
		control.element.onmouseover = function() {
			control.questionEl.className = 'ol-control-question';
		};
		control.element.onmouseout = function() {
			control.questionEl.className = 'ol-control-hidden';
		};
	}

	// Toggle the button status & aspect
	control.active = 0;
	control.toggle = function(newActive, group) {
		// Toggle by default
		if (typeof newActive == 'undefined')
			newActive = (control.active + 1);

		// Unselect all other controlButtons from the same group
		if (newActive && options.group)
			control.getMap().getControls().forEach(function(c) {
				if (c != control &&
					typeof c.toggle == 'function') // Only for controlButtons
					c.toggle(0, options.group);
			});

		// Execute the requested change
		if (control.active != newActive &&
			(!group || group == options.group)) { // Only for the concerned controls
			control.active = newActive % options.buttonBackgroundColors.length;
			buttonEl.style.backgroundColor = options.buttonBackgroundColors[control.active];
			options.activate(control.active);
		}
	};
	return control;
}

/**
 * No control
 * Can be added to controls:[] but don't display it
 * Requires controlButton
 */
function noControl() {
	return new ol.control.Control({
		element: document.createElement('div'),
	});
}

/**
 * Permalink control
 * "map" url hash or cookie = {map=<ZOOM>/<LON>/<LAT>/<LAYER>}
 * Don't set view when you declare the map
 */
function controlPermalink(options) {
	options = Object.assign({
		init: true, // {true | false} use url hash or "controlPermalink" cookie to position the map.
		setUrl: false, // Change url hash to position the map.
		display: false, // Display link the map.
		hash: '?', // {?, #} the permalink delimiter
	}, options);
	const aEl = document.createElement('a'),
		control = new ol.control.Control({
			element: document.createElement('div'), //HACK No button
			render: render,
		}),
		zoomMatch = location.href.match(/zoom=([0-9]+)/),
		latLonMatch = location.href.match(/lat=([-0-9\.]+)&lon=([-.0-9]+)/);
	let params = (
			location.href + // Priority to ?map=6/2/47 or #map=6/2/47
			(zoomMatch && latLonMatch ? // Old format ?zoom=6&lat=47&lon=5
				';map=' + zoomMatch[1] + '/' + latLonMatch[2] + '/' + latLonMatch[1] :
				'') +
			document.cookie + // Then the cookie
			';map=' + options.initialFit + // Optional default
			';map=6/2/47') // Default
		.match(/map=([0-9\.]+)\/([-0-9\.]+)\/([-0-9\.]+)/); // map=<ZOOM>/<LON>/<LAT>

	if (options.display) {
		control.element.className = 'ol-permalink';
		aEl.innerHTML = 'Permalink';
		aEl.title = 'Generate a link with map zoom & position';
		control.element.appendChild(aEl);
	}

	if (typeof options.initialCenter == 'function') {
		options.initialCenter([parseFloat(params[2]), parseFloat(params[3])]);
	}

	function render(evt) {
		const view = evt.map.getView();

		// Set center & zoom at the init
		if (options.init &&
			params) { // Only once
			view.setZoom(params[1]);
			view.setCenter(ol.proj.transform([parseFloat(params[2]), parseFloat(params[3])], 'EPSG:4326', 'EPSG:3857'));
			params = null;
		}

		// Set the permalink with current map zoom & position
		if (view.getCenter()) {
			const ll4326 = ol.proj.transform(view.getCenter(), 'EPSG:3857', 'EPSG:4326'),
				newParams = [
					parseInt(view.getZoom()), // Zoom
					Math.round(ll4326[0] * 100000) / 100000, // Lon
					Math.round(ll4326[1] * 100000) / 100000, // Lat
				];

			if (options.display)
				aEl.href = options.hash + 'map=' + newParams.join('/');
			if (options.setUrl)
				location.href = '#map=' + newParams.join('/');
			document.cookie = 'map=' + newParams.join('/') + ';path=/; SameSite=Strict';
		}
	}
	return control;
}

/**
 * Control to displays the mouse position
 */
function controlMousePosition() {
	return new ol.control.MousePosition({
		coordinateFormat: ol.coordinate.createStringXY(5),
		projection: 'EPSG:4326',
		className: 'ol-coordinate',
		undefinedHTML: String.fromCharCode(0), //HACK hide control when mouse is out of the map
	});
}

/**
 * Control to displays the length of a line overflown
 * option hoverStyle style the hovered feature
 */
function controlLengthLine() {
	const control = new ol.control.Control({
		element: document.createElement('div'), // div to display the measure
	});
	control.element.className = 'ol-length-line';

	control.setMap = function(map) { //HACK execute actions on Map init
		ol.control.Control.prototype.setMap.call(this, map);

		map.on('pointermove', function(evt) {
			control.element.innerHTML = ''; // Clear the measure if hover no feature

			// Find new features to hover
			map.forEachFeatureAtPixel(evt.pixel, calculateLength, {
				hitTolerance: 6,
			});
		});
	};

	//BEST calculate distance to the ends
	function calculateLength(feature) {
		// Display the line length
		if (feature) {
			const length = ol.sphere.getLength(feature.getGeometry());
			if (length >= 100000)
				control.element.innerHTML = (Math.round(length / 1000)) + ' km';
			else if (length >= 10000)
				control.element.innerHTML = (Math.round(length / 100) / 10) + ' km';
			else if (length >= 1000)
				control.element.innerHTML = (Math.round(length / 10) / 100) + ' km';
			else if (length >= 1)
				control.element.innerHTML = (Math.round(length)) + ' m';
		}
		return false; // Continue detection (for editor that has temporary layers)
	}
	return control;
}

/**
 * Control to display set preload of depth upper level tiles or depthFS if we are on full screen mode
 * This prepares the browser to become offline on the same session
 */
function controlTilesBuffer(depth, depthFS) {
	const control = new ol.control.Control({
		element: document.createElement('div'), //HACK No button
	});

	control.setMap = function(map) { //HACK execute actions on Map init
		ol.control.Control.prototype.setMap.call(this, map);

		// Change preload when the window expand to fullscreen
		map.on('precompose', function() {
			map.getLayers().forEach(function(layer) {
				const fs = document.webkitIsFullScreen || // Edge, Opera
					document.msFullscreenElement ||
					document.fullscreenElement; // Chrome, FF, Opera

				if (typeof layer.setPreload == 'function')
					layer.setPreload(fs ? depthFS || depth || 1 : depth || 1);
			});
		});
	};

	return control;
}

/**
 * Full window polyfill for non full screen browsers (iOS)
 */
function controlFullScreen(options) {
	let pseudoFullScreen = !(
		document.body.webkitRequestFullscreen || // What is tested by ol.control.FullScreen
		(document.body.msRequestFullscreen && document.msFullscreenEnabled) ||
		(document.body.requestFullscreen && document.fullscreenEnabled)
	);

	// Force the control button display if no full screen is supported
	if (pseudoFullScreen) {
		document.body.msRequestFullscreen = true; // What is tested by ol.control.FullScreen
		document.msFullscreenEnabled = true;
	}

	// Call the former control constructor
	const control = new ol.control.FullScreen(Object.assign({
		label: '', //HACK Bad presentation on IE & FF
		tipLabel: 'Plein ??cran',
	}, options));

	// Add some tricks when the map is known !
	control.setMap = function(map) {
		ol.control.FullScreen.prototype.setMap.call(this, map);

		const el = map.getTargetElement();
		if (pseudoFullScreen) {
			el.requestFullscreen = toggle; // What is called first by ol.control.FullScreen
			document.exitFullscreen = toggle;
		} else {
			document.addEventListener('webkitfullscreenchange', toggle, false); // Edge, Safari
			document.addEventListener('MSFullscreenChange', toggle, false); // IE
		}

		function toggle() {
			if (pseudoFullScreen) // Toggle the simulated isFullScreen & the control button
				document.webkitIsFullScreen = !document.webkitIsFullScreen;
			const isFullScreen = document.webkitIsFullScreen ||
				document.fullscreenElement ||
				document.msFullscreenElement;
			el.classList[isFullScreen ? 'add' : 'remove']('ol-pseudo-fullscreen');
			control.handleFullScreenChange_(); // Change the button class & resize the map
		}
	};
	return control;
}

/**
 * Geocoder
 * Requires https://github.com/jonataswalker/ol-geocoder/tree/master/dist
 */
//TODO BUG controm 1px down on FireFox
//TODO BUG pas de loupe (return sera pris par phpBB)
function controlGeocoder(options) {
	options = Object.assign({
		title: 'Recherche sur la carte',
	}, options);

	// V??rify if geocoder is available (not supported in IE)
	if (typeof Geocoder != 'function')
		return new ol.control.Control({
			element: document.createElement('div'), //HACK No button
		});

	const geocoder = new Geocoder('nominatim', {
		provider: 'osm',
		lang: 'FR',
		keepOpen: true,
		placeholder: options.title, // Initialization of the input field
	});

	// Move the button at the same level than the other control's buttons
	geocoder.container.firstElementChild.firstElementChild.title = options.title;
	geocoder.container.appendChild(geocoder.container.firstElementChild.firstElementChild);

	return geocoder;
}

/**
 * GPS control
 * Requires controlButton
 */
//BEST GPS tap on map = distance from GPS calculation
//TODO position initiale quand PC fixe ?
//TODO average inertial counter to get better speed
function controlGPS() {
	let view, geolocation, nbLoc, position, altitude;

	//Button
	const button = controlButton({
		className: 'myol-button ol-gps',
		buttonBackgroundColors: ['white', '#ef3', '#bbb'], // Define 3 states button
		title: 'Centrer sur la position GPS',
		activate: function(active) {
			geolocation.setTracking(active !== 0);
			graticuleLayer.setVisible(active !== 0);
			nbLoc = 0;
			if (!active) {
				view.setRotation(0, 0); // Set north to top
				displayEl.innerHTML = '';
				displayEl.classList.remove('ol-control-gps');
			}
		}
	});

	// Display status, altitude & speed
	const displayEl = document.createElement('div');
	button.element.appendChild(displayEl);

	function displayValues() {
		const displays = [],
			speed = Math.round(geolocation.getSpeed() * 36) / 10;

		if (button.active) {
			altitude = geolocation.getAltitude();
			if (altitude) {
				displays.push(Math.round(altitude) + ' m');
				if (!isNaN(speed))
					displays.push(speed + ' km/h');
			} else
				displays.push('GPS sync...');
		}
		displayEl.innerHTML = displays.join(', ');
		if (displays.length)
			displayEl.classList.add('ol-control-gps');
		else
			displayEl.classList.remove('ol-control-gps');
	}

	// Graticule
	const graticule = new ol.Feature(),
		northGraticule = new ol.Feature(),
		graticuleLayer = new ol.layer.Vector({
			source: new ol.source.Vector({
				features: [graticule, northGraticule]
			}),
			style: new ol.style.Style({
				fill: new ol.style.Fill({
					color: 'rgba(128,128,255,0.2)'
				}),
				stroke: new ol.style.Stroke({
					color: '#20b',
					lineDash: [16, 14],
					width: 1
				})
			})
		});

	northGraticule.setStyle(new ol.style.Style({
		stroke: new ol.style.Stroke({
			color: '#c00',
			lineDash: [16, 14],
			width: 1
		})
	}));

	function renderReticule() {
		position = geolocation.getPosition();
		if (button.active && altitude && position) {
			const map = button.map_,
				// Estimate the viewport size
				hg = map.getCoordinateFromPixel([0, 0]),
				bd = map.getCoordinateFromPixel(map.getSize()),
				far = Math.hypot(hg[0] - bd[0], hg[1] - bd[1]) * 10,

				// The graticule
				geometry = [
					new ol.geom.MultiLineString([
						[
							[position[0] - far, position[1]],
							[position[0] + far, position[1]]
						],
						[
							[position[0], position[1]],
							[position[0], position[1] - far]
						],
					]),
				],

				// Color north in red
				northGeometry = [
					new ol.geom.LineString([
						[position[0], position[1]],
						[position[0], position[1] + far]
					]),
				];

			graticule.setGeometry(new ol.geom.GeometryCollection(geometry));
			northGraticule.setGeometry(new ol.geom.GeometryCollection(northGeometry));

			// The accurate circle
			const accuracy = geolocation.getAccuracyGeometry();
			if (accuracy)
				geometry.push(accuracy);

			// Center the map
			if (button.active == 1) {
				view.setCenter(position);

				if (!nbLoc) // Only the first time after activation
					view.setZoom(17); // Zoom on the area
				nbLoc++;
			}
		}
		displayValues();
	}

	button.setMap = function(map) { //HACK execute actions on Map init
		ol.control.Control.prototype.setMap.call(this, map);

		view = map.getView();
		map.addLayer(graticuleLayer);

		geolocation = new ol.Geolocation({
			projection: view.getProjection(),
			trackingOptions: {
				enableHighAccuracy: true,
			},
		});

		// Browser heading from the inertial & magnetic sensors
		window.addEventListener(
			'deviceorientationabsolute',
			function(evt) {
				const heading = evt.alpha || evt.webkitCompassHeading; // Android || iOS
				if (button.active == 1 &&
					altitude && // Only if true GPS position
					event.absolute) // Breaks support for non-absolute browsers, like firefox mobile
					view.setRotation(
						Math.PI / 180 * (heading - screen.orientation.angle), // Delivered ?? reverse clockwize
						0
					);
			}
		);

		geolocation.on(['change:altitude', 'change:speed', 'change:tracking'], displayValues);
		map.on('moveend', renderReticule); // Refresh graticule after map zoom
		geolocation.on('change:position', renderReticule);
		geolocation.on('error', function(error) {
			alert('Geolocation error: ' + error.message);
		});
	};

	return button;
}

/**
 * GPX file loader control
 * Requires controlButton
 */
//BEST misc formats
function controlLoadGPX(options) {
	options = Object.assign({
		label: '\u25b2',
		title: 'Visualiser un fichier GPX sur la carte',
		activate: function() {
			inputEl.click();
		},
	}, options);

	const inputEl = document.createElement('input'),
		format = new ol.format.GPX(),
		reader = new FileReader(),
		button = controlButton(options);

	inputEl.type = 'file';
	inputEl.addEventListener('change', function() {
		reader.readAsText(inputEl.files[0]);
	});

	reader.onload = function() {
		const map = button.getMap(),
			features = format.readFeatures(reader.result, {
				dataProjection: 'EPSG:4326',
				featureProjection: 'EPSG:3857',
			}),
			added = map.dispatchEvent({
				type: 'myol:onfeatureload', // Warn layerEditGeoJson that we uploaded some features
				features: features,
			});

		if (added !== false) { // If one used the feature
			// Display the track on the map
			const source = new ol.source.Vector({
					format: format,
					features: features,
				}),
				layer = new ol.layer.Vector({
					source: source,
					style: function(feature) {
						return new ol.style.Style({
							image: new ol.style.Icon({
								src: '//chemineur.fr/ext/Dominique92/GeoBB/icones/' + feature.getProperties().sym + '.png',
							}),
							stroke: new ol.style.Stroke({
								color: 'blue',
								width: 2,
							}),
						});
					},
				});
			map.addLayer(layer);
		}

		// Zoom the map on the added features
		const extent = ol.extent.createEmpty();
		for (let f in features)
			ol.extent.extend(extent, features[f].getGeometry().getExtent());
		map.getView().fit(extent, {
			maxZoom: 17,
			size: map.getSize(),
			padding: [5, 5, 5, 5],
		});
	};
	return button;
}

/**
 * File downloader control
 * Requires controlButton
 */
function controlDownload(options) {
	options = Object.assign({
		label: '\u25bc',
		buttonBackgroundColors: ['white'],
		className: 'myol-button ol-download',
		title: 'Cliquer sur un format ci-dessous\n' +
			'pour obtenir un fichier contenant\n' +
			'les ??l??ments visibles dans la fen??tre.\n' +
			'(la liste peut ??tre incompl??te pour les grandes zones)',
		question: '<span/>', // Invisible but generates a questionEl <div>
		fileName: document.title || 'openlayers',
		activate: download,
	}, options);

	const hiddenEl = document.createElement('a'),
		button = controlButton(options);
	hiddenEl.target = '_self';
	hiddenEl.style = 'display:none';
	document.body.appendChild(hiddenEl);

	const formats = {
		GPX: 'application/gpx+xml',
		KML: 'vnd.google-earth.kml+xml',
		GeoJSON: 'application/json',
	};
	for (let f in formats) {
		const el = document.createElement('p');
		el.onclick = download;
		el.innerHTML = f;
		el.id = formats[f];
		el.title = 'Obtenir un fichier ' + f;
		button.questionEl.appendChild(el);
	}

	function download() { //formatName, mime
		const formatName = this.textContent || 'GPX', //BEST get first value as default
			mime = this.id,
			format = new ol.format[formatName](),
			map = button.getMap();
		let features = [],
			extent = map.getView().calculateExtent();

		// Get all visible features
		if (options.savedLayer)
			getFeatures(options.savedLayer);
		else
			map.getLayers().forEach(getFeatures);

		function getFeatures(layer) {
			if (layer.getSource() && layer.getSource().forEachFeatureInExtent) // For vector layers only
				layer.getSource().forEachFeatureInExtent(extent, function(feature) {
					if (!layer.marker_) //BEST find a better way to don't save the cursors
						features.push(feature);
				});
		}

		// Transform polygons in lines if format is GPX
		if (formatName == 'GPX') {
			const coords = optimiseFeatures(features, true, true);
			for (let l in coords.polys)
				features.push(new ol.Feature({
					geometry: new ol.geom.LineString(coords.polys[l]),
				}));
		}

		const data = format.writeFeatures(features, {
				dataProjection: 'EPSG:4326',
				featureProjection: 'EPSG:3857',
				decimals: 5,
			})
			// Beautify the output
			.replace(/<[a-z]*>(0|null|[\[object Object\]|[NTZa:-]*)<\/[a-z]*>/g, '')
			.replace(/<Data name="[a-z_]*"\/>|<Data name="[a-z_]*"><\/Data>|,"[a-z_]*":""/g, '')
			.replace(/<Data name="copy"><value>[a-z_\.]*<\/value><\/Data>|,"copy":"[a-z_\.]*"/g, '')
			.replace(/(<\/gpx|<\/?wpt|<\/?trk>|<\/?rte>|<\/kml|<\/?Document)/g, '\n$1')
			.replace(/(<\/?Placemark|POINT|LINESTRING|POLYGON|<Point|"[a-z_]*":|})/g, '\n$1')
			.replace(/(<name|<ele|<sym|<link|<type|<rtept|<\/?trkseg|<\/?ExtendedData)/g, '\n\t$1')
			.replace(/(<trkpt|<Data|<LineString|<\/?Polygon|<Style)/g, '\n\t\t$1')
			.replace(/(<[a-z]+BoundaryIs)/g, '\n\t\t\t$1'),

			file = new Blob([data], {
				type: mime,
			});

		if (typeof navigator.msSaveBlob == 'function') // IE/Edge
			navigator.msSaveBlob(file, options.fileName + '.' + formatName.toLowerCase());
		else {
			hiddenEl.download = options.fileName + '.' + formatName.toLowerCase();
			hiddenEl.href = URL.createObjectURL(file);
			hiddenEl.click();
		}
	}
	return button;
}

/**
 * Print control
 * Requires controlButton
 */
function controlPrint() {
	const button = controlButton({
		className: 'myol-button ol-print',
		title: 'Pour imprimer la carte:\n' +
			'choisir l???orientation,\n' +
			'zoomer et d??placer,\n' +
			'cliquer sur l???ic??ne imprimante.',
		question: '<input type="radio" name="print-orientation" value="0" />Portrait A4<br>' +
			'<input type="radio" name="print-orientation" value="1" />Paysage A4',
		activate: function() {
			resizeDraft(button.getMap());
			button.getMap().once('rendercomplete', function() {
				window.print();
				location.reload();
			});
		},
	});

	button.setMap = function(map) { //HACK execute actions on Map init
		ol.control.Control.prototype.setMap.call(this, map);

		const oris = document.getElementsByName('print-orientation');
		for (let i = 0; i < oris.length; i++) // Use ?? for ?? because of a bug in Edge / IE
			oris[i].onchange = resizeDraft;
	};

	function resizeDraft() {
		// Resize map to the A4 dimensions
		const map = button.getMap(),
			mapEl = map.getTargetElement(),
			oris = document.querySelectorAll("input[name=print-orientation]:checked"),
			orientation = oris.length ? oris[0].value : 0;
		mapEl.style.width = orientation === 0 ? '210mm' : '297mm';
		mapEl.style.height = orientation === 0 ? '290mm' : '209.9mm'; // -.1mm for Chrome landscape no marging bug
		map.setSize([mapEl.offsetWidth, mapEl.offsetHeight]);

		// Hide all but the map
		for (let child = document.body.firstElementChild; child !== null; child = child.nextSibling)
			if (child.style && child !== mapEl)
				child.style.display = 'none';

		// Raises the map to the top level
		document.body.appendChild(mapEl);
		document.body.style.margin = 0;
		document.body.style.padding = 0;

		document.addEventListener('keydown', function(evt) {
			if (evt.key == 'Escape')
				setTimeout(function() {
					window.location.reload();
				});
		});
	}
	return button;
}

/**
 * geoJson points, lines & polygons display & edit
 * Marker position display & edit
 * Lines & polygons edit
 * Requires JSONparse, myol:onadd, escapedStyle, controlButton
 */
function layerEditGeoJson(options) {
	options = Object.assign({
		format: new ol.format.GeoJSON(),
		projection: 'EPSG:3857',
		geoJsonId: 'editable-json', // Option geoJsonId : html element id of the geoJson features to be edited
		focus: false, // Zoom the map on the loaded features
		snapLayers: [], // Vector layers to snap on
		readFeatures: function() {
			return options.format.readFeatures(
				options.geoJson ||
				JSONparse(geoJsonValue || '{"type":"FeatureCollection","features":[]}'), {
					featureProjection: options.projection,
				});
		},
		saveFeatures: function(coordinates, format) {
			return format.writeFeatures(
					source.getFeatures(
						coordinates, format), {
						featureProjection: options.projection,
						decimals: 5,
					})
				.replace(/"properties":\{[^\}]*\}/, '"properties":null');
		},
		// Drag lines or Polygons
		styleOptions: {
			// Marker circle
			image: new ol.style.Circle({
				radius: 4,
				stroke: new ol.style.Stroke({
					color: 'red',
					width: 2,
				}),
			}),
			// Editable lines or polygons border
			stroke: new ol.style.Stroke({
				color: 'red',
				width: 2,
			}),
			// Editable polygons
			fill: new ol.style.Fill({
				color: 'rgba(0,0,255,0.2)',
			}),
		},
		editStyleOptions: { // Hover / modify / create
			// Editable lines or polygons border
			stroke: new ol.style.Stroke({
				color: 'red',
				width: 4,
			}),
			// Editable polygons fill
			fill: new ol.style.Fill({
				color: 'rgba(255,0,0,0.3)',
			}),
		},
	}, options);

	const geoJsonEl = document.getElementById(options.geoJsonId), // Read data in an html element
		geoJsonValue = geoJsonEl ? geoJsonEl.value : '',
		extent = ol.extent.createEmpty(), // For focus on all features calculation
		features = options.readFeatures(),
		source = new ol.source.Vector({
			features: features,
			wrapX: false,
		}),
		layer = new ol.layer.Vector({
			source: source,
			zIndex: 20,
			style: escapedStyle(options.styleOptions),
		}),
		style = escapedStyle(options.styleOptions),
		editStyle = escapedStyle(options.styleOptions, options.editStyleOptions),
		snap = new ol.interaction.Snap({
			source: source,
		}),
		modify = new ol.interaction.Modify({
			source: source,
			style: editStyle,
		}),
		controlModify = controlButton({
			group: 'edit',
			label: options.titleModify ? 'M' : null,
			buttonBackgroundColors: ['white', '#ef3'],
			title: options.titleModify,
			activate: function(active) {
				activate(active, modify);
			},
		}),

		// Pointer edit <input>
		displayPointEl = document.getElementById(options.displayPointId),
		inputEls = displayPointEl ? displayPointEl.getElementsByTagName('input') : {};

	for (let i = 0; i < inputEls.length; i++) {
		inputEls[i].onchange = editPoint;
		inputEls[i].source = source;
	}

	// Snap on vector layers
	options.snapLayers.forEach(function(layer) {
		layer.getSource().on('change', function() {
			const fs = layer.getSource().getFeatures();
			for (let f in fs)
				snap.addFeature(fs[f]);
		});
	});

	// Manage hover to save modify actions integrity
	let hoveredFeature = null;

	layer.once('myol:onadd', function(evt) {
		const map = evt.map;
		hoverManager(map);
		optimiseEdited(); // Treat the geoJson input as any other edit

		//HACK Avoid zooming when you leave the mode by doubleclick
		map.getInteractions().forEach(function(i) {
			if (i instanceof ol.interaction.DoubleClickZoom)
				map.removeInteraction(i);
		});

		// Add required controls
		if (options.titleModify || options.dragPoint) {
			map.addControl(controlModify);
			controlModify.toggle(true);
		}
		if (options.titleLine)
			map.addControl(controlDraw({
				type: 'LineString',
				label: 'L',
				title: options.titleLine,
			}));
		if (options.titlePolygon)
			map.addControl(controlDraw({
				type: 'Polygon',
				label: 'P',
				title: options.titlePolygon,
			}));

		// Zoom the map on the loaded features
		if (options.focus && features.length) {
			for (let f in features)
				ol.extent.extend(extent, features[f].getGeometry().getExtent());
			map.getView().fit(extent, {
				maxZoom: options.focus,
				size: map.getSize(),
				padding: [5, 5, 5, 5],
			});
		}

		// Add features loaded from GPX file
		map.on('myol:onfeatureload', function(evt) {
			source.addFeatures(evt.features);
			optimiseEdited();
			return false; // Warn controlLoadGPX that the editor got the included feature
		});

		map.on('pointermove', hover);
	});

	function removeFeaturesAtPixel(pixel) {
		const selectedFeatures = layer.map_.getFeaturesAtPixel(pixel, {
			hitTolerance: 6,
			layerFilter: function(l) {
				return l.ol_uid == layer.ol_uid;
			}
		});
		for (let f in selectedFeatures) // We delete the selected feature
			source.removeFeature(selectedFeatures[f]);
	}

	//HACK move only one summit when dragging
	modify.handleDragEvent = function(evt) {
		let draggedUid; // The first one will be the only one that will be dragged
		for (let s in this.dragSegments_) {
			let segmentUid = this.dragSegments_[s][0].feature.ol_uid; // Get the current item uid
			if (draggedUid && segmentUid != draggedUid) // If it is not the first one
				delete this.dragSegments_[s]; // Remove it from the dragged list
			draggedUid = segmentUid;
		}
		this.dragSegments_ = this.dragSegments_.filter(Boolean); // Reorder array keys
		ol.interaction.Modify.prototype.handleDragEvent.call(this, evt); // Call the former method
	};

	//HACK delete feature when Ctrl+Alt click
	modify.handleDownEvent = function(evt) {
		if (evt.originalEvent.ctrlKey && evt.originalEvent.altKey)
			removeFeaturesAtPixel(evt.pixel_);
		return ol.interaction.Modify.prototype.handleDownEvent.call(this, evt); // Call the former method
	};

	modify.on('modifyend', function(evt) {
		if (evt.mapBrowserEvent.originalEvent.altKey) {
			// Ctrl + Alt click on segment : delete feature
			if (evt.mapBrowserEvent.originalEvent.ctrlKey)
				removeFeaturesAtPixel(evt.mapBrowserEvent.pixel);
			// Alt click on segment : delete the segment & split the line
			else if (evt.target.vertexFeature_)
				return optimiseEdited(evt.target.vertexFeature_.getGeometry().getCoordinates());
		}
		optimiseEdited();
		hoveredFeature = null; // Recover hovering
	});

	// End of feature creation
	source.on('change', function() { // Called all sliding long
		if (source.modified) { // Awaiting adding complete to save it
			source.modified = false; // To avoid loops
			optimiseEdited();
			hoveredFeature = null; // Recover hovering
		}
	});

	function activate(active, inter) { // Callback at activation / desactivation, mandatory, no default
		if (active) {
			layer.map_.addInteraction(inter);
			layer.map_.addInteraction(snap); // Must be added after
		} else {
			layer.map_.removeInteraction(snap);
			layer.map_.removeInteraction(inter);
		}
	}

	function controlDraw(options) {
		const button = controlButton(Object.assign({
				group: 'edit',
				buttonBackgroundColors: ['white', '#ef3'],
				activate: function(active) {
					activate(active, interaction);
				},
			}, options)),
			interaction = new ol.interaction.Draw(Object.assign({
				style: editStyle,
				source: source,
			}, options));

		interaction.on(['drawend'], function() {
			// Switch on the main editor button
			controlModify.toggle(true);

			// Warn source 'on change' to save the feature
			// Don't do it now as it's not yet added to the source
			source.modified = true;
		});
		return button;
	}

	//BEST use the centralized hover function
	function hover(evt) {
		let nbFeaturesAtPixel = 0;
		layer.map_.forEachFeatureAtPixel(evt.pixel, function(feature) {
			source.getFeatures().forEach(function(f) {
				if (f.ol_uid == feature.ol_uid) {
					nbFeaturesAtPixel++;
					if (!hoveredFeature) { // Hovering only one
						feature.setStyle(editStyle);
						hoveredFeature = feature; // Don't change it until there is no more hovered
					}
				}
			});
		}, {
			hitTolerance: 6, // Default is 0
		});

		// If no more hovered, return to the normal style
		if (!nbFeaturesAtPixel && !evt.originalEvent.buttons && hoveredFeature) {
			hoveredFeature.setStyle(style);
			hoveredFeature = null;
		}
	}

	//TODO BUG don't check CH1903 hiding
	layer.centerMarker = function() {
		source.getFeatures().forEach(function(f) {
			f.getGeometry().setCoordinates(
				layer.map_.getView().getCenter()
			);
		});
	};

	layer.centerMap = function() {
		source.getFeatures().forEach(function(f) {
			layer.map_.getView().setCenter(
				f.getGeometry().getCoordinates()
			);
		});
	};

	function editPoint(evt) {
		const ll = evt.target.name.length == 3 ?
			ol.proj.transform([inputEls.lon.value, inputEls.lat.value], 'EPSG:4326', 'EPSG:3857') : // Modify lon | lat
			ol.proj.transform([parseInt(inputEls.x.value), parseInt(inputEls.y.value)], 'EPSG:21781', 'EPSG:3857'); // Modify x | y

		evt.target.source.getFeatures().forEach(function(f) {
			f.getGeometry().setCoordinates(ll);
		});

		optimiseEdited();
	}

	function displayPoint(ll) {
		if (displayPointEl) {
			const ll4326 = ol.proj.transform(ll, 'EPSG:3857', 'EPSG:4326'),
				formats = {
					decimal: ['Degr??s d??cimaux', 'EPSG:4326', 'format',
						'Longitude: {x}, Latitude: {y}',
						5
					],
					degminsec: ['Deg Min Sec', 'EPSG:4326', 'toStringHDMS'],
				};

			let ll21781 = null;
			if (typeof proj4 == 'function') {
				// Specific Swiss coordinates EPSG:21781 (CH1903 / LV03)
				if (ol.extent.containsCoordinate([664577, 5753148, 1167741, 6075303], ll)) {
					proj4.defs('EPSG:21781', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=660.077,13.551,369.344,2.484,1.783,2.939,5.66 +units=m +no_defs');
					ol.proj.proj4.register(proj4);
					ll21781 = ol.proj.transform(ll, 'EPSG:3857', 'EPSG:21781');

					formats.swiss = ['Suisse', 'EPSG:21781', 'format', 'X= {x} Y= {y} (CH1903)'];
				}

				// Fuseau UTM
				const u = Math.floor(ll4326[0] / 6 + 90) % 60 + 1;
				formats.utm = ['UTM', 'EPSG:326' + u, 'format', 'UTM ' + u + ' lon: {x}, lat: {y}'];
				proj4.defs('EPSG:326' + u, '+proj=utm +zone=' + u + ' +ellps=WGS84 +datum=WGS84 +units=m +no_defs');
				ol.proj.proj4.register(proj4);
			}
			// Display or not the EPSG:21781 coordinates
			const epsg21781 = document.getElementsByClassName('epsg-21781');
			for (let e = 0; e < epsg21781.length; e++)
				epsg21781[e].style.display = ll21781 ? '' : 'none';

			if (inputEls.length)
				// Set the html input
				for (let i = 0; i < inputEls.length; i++)
					switch (inputEls[i].name) {
						case 'lon':
							inputEls[i].value = Math.round(ll4326[0] * 100000) / 100000;
							break;
						case 'lat':
							inputEls[i].value = Math.round(ll4326[1] * 100000) / 100000;
							break;
						case 'x':
							inputEls[i].value = ll21781 ? Math.round(ll21781[0]) : '-';
							break;
						case 'y':
							inputEls[i].value = ll21781 ? Math.round(ll21781[1]) : '-';
							break;
					}
			else {
				// Set the html display
				if (!formats[options.displayFormat])
					options.displayFormat = 'decimal';

				let f = formats[options.displayFormat],
					html = ol.coordinate[f[2]](
						ol.proj.transform(ll, 'EPSG:3857', f[1]),
						f[3], f[4], f[5]
					) + ' <select>';

				for (let f in formats)
					html += '<option value="' + f + '"' +
					(f == options.displayFormat ? ' selected="selected"' : '') + '>' +
					formats[f][0] + '</option>';

				displayPointEl.innerHTML = html.replace(
					/( [-0-9]+)([0-9][0-9][0-9],? )/g,
					function(whole, part1, part2) {
						return part1 + ' ' + part2;
					}
				) + '</select>';
			}
			// Select action
			const selects = displayPointEl.getElementsByTagName('select');
			if (selects.length)
				selects[0].onchange = function(evt) {
					options.displayFormat = evt.target.value;
					displayPoint(ll);
				};
		}
	}

	function optimiseEdited(pointerPosition) {
		const coords = optimiseFeatures(
			source.getFeatures(),
			options.titleLine,
			options.titlePolygon,
			true,
			true,
			pointerPosition
		);

		// Recreate features
		source.clear();
		if (options.singlePoint) {
			// Initialise the marker at the center on the map if no coords are available
			//TODO BUG si json entr??e vide, n'affiche pas les champs num??riques
			coords.points.push(layer.map_.getView().getCenter());

			// Keep only the first point
			source.addFeature(new ol.Feature({
				geometry: new ol.geom.Point(coords.points[0]),
				draggable: options.dragPoint,
			}));
		} else {
			for (let p in coords.points)
				source.addFeature(new ol.Feature({
					geometry: new ol.geom.Point(coords.points[p]),
					draggable: options.dragPoint,
				}));
			for (let l in coords.lines)
				source.addFeature(new ol.Feature({
					geometry: new ol.geom.LineString(coords.lines[l]),
				}));
			for (let p in coords.polys)
				source.addFeature(new ol.Feature({
					geometry: new ol.geom.Polygon(coords.polys[p]),
				}));
		}

		// Display & edit 1st point coordinates
		if (coords.points.length && displayPointEl)
			displayPoint(coords.points[0]);

		// Save geometries in <EL> as geoJSON at every change
		if (geoJsonEl)
			geoJsonEl.value = options.saveFeatures(coords, options.format);
	}

	return layer;
}

/**
 * Refurbish Points, Lines & Polygons
 * Split lines having a summit at removePosition
 */
function optimiseFeatures(features, withLines, withPolygons, merge, holes, removePosition) {
	const points = [],
		lines = [],
		polys = [];

	// Get all edited features as array of coordinates
	for (let f in features)
		flatFeatures(features[f].getGeometry(), points, lines, polys, removePosition);

	for (let a in lines)
		// Exclude 1 coordinate features (points)
		//BEST manage points
		if (lines[a].length < 2)
			delete lines[a];

		// Merge lines having a common end
		else if (merge)
		for (let b = 0; b < a; b++) // Once each combination
			if (lines[b]) {
				const m = [a, b];
				for (let i = 4; i; i--) // 4 times
					if (lines[m[0]] && lines[m[1]]) { // Test if the line has been removed
						// Shake lines end to explore all possibilities
						m.reverse();
						lines[m[0]].reverse();
						if (compareCoords(lines[m[0]][lines[m[0]].length - 1], lines[m[1]][0])) {
							// Merge 2 lines having 2 ends in common
							lines[m[0]] = lines[m[0]].concat(lines[m[1]].slice(1));
							delete lines[m[1]]; // Remove the line but don't renumber the array keys
						}
					}
			}

	// Make polygons with in loop lines
	for (let a in lines)
		if (withPolygons && // Only if polygons are autorized
			lines[a]) {
			// Close open lines
			if (!withLines) // If only polygons are autorized
				if (!compareCoords(lines[a]))
					lines[a].push(lines[a][0]);

			if (compareCoords(lines[a])) { // If this line is closed
				// Split squeezed polygons
				for (let i1 = 0; i1 < lines[a].length - 1; i1++) // Explore all summits combinaison
					for (let i2 = 0; i2 < i1; i2++)
						if (lines[a][i1][0] == lines[a][i2][0] &&
							lines[a][i1][1] == lines[a][i2][1]) { // Find 2 identical summits
							let squized = lines[a].splice(i2, i1 - i2); // Extract the squized part
							squized.push(squized[0]); // Close the poly
							polys.push([squized]); // Add the squized poly
							i1 = i2 = lines[a].length; // End loop
						}

				// Convert closed lines into polygons
				polys.push([lines[a]]); // Add the polygon
				delete lines[a]; // Forget the line
			}
		}

	// Makes holes if a polygon is included in a biggest one
	for (let p1 in polys) // Explore all Polygons combinaison
		if (holes && // Make holes option
			polys[p1]) {
			const fs = new ol.geom.Polygon(polys[p1]);
			for (let p2 in polys)
				if (polys[p2] && p1 != p2) {
					let intersects = true;
					for (let c in polys[p2][0])
						if (!fs.intersectsCoordinate(polys[p2][0][c]))
							intersects = false;
					if (intersects) { // If one intersects a bigger
						polys[p1].push(polys[p2][0]); // Include the smaler in the bigger
						delete polys[p2]; // Forget the smaller
					}
				}
		}

	return {
		points: points,
		lines: lines.filter(Boolean), // Remove deleted array members
		polys: polys.filter(Boolean),
	};
}

function flatFeatures(geom, points, lines, polys, removePosition) {
	// Expand geometryCollection
	if (geom.getType() == 'GeometryCollection') {
		const geometries = geom.getGeometries();
		for (let g in geometries)
			flatFeatures(geometries[g], points, lines, polys, removePosition);
	}
	// Point
	else if (geom.getType().match(/point$/i))
		points.push(geom.getCoordinates());

	// line & poly
	else
		flatCoord(lines, geom.getCoordinates(), removePosition); // Get lines or polyons as flat array of coords
}

// Get all lines fragments (lines, polylines, polygons, multipolygons, hole polygons, ...) at the same level & split if one point = pointerPosition
function flatCoord(existingCoords, newCoords, pointerPosition) {
	if (typeof newCoords[0][0] == 'object') // Multi*
		for (let c1 in newCoords)
			flatCoord(existingCoords, newCoords[c1], pointerPosition);
	else {
		existingCoords.push([]); // Increment existingCoords array
		for (let c2 in newCoords) {
			if (pointerPosition && compareCoords(newCoords[c2], pointerPosition)) {
				existingCoords.push([]); // Forget that one & increment existingCoords array
			} else
				// Stack on the last existingCoords array
				existingCoords[existingCoords.length - 1].push(newCoords[c2]);
		}
	}
}

function compareCoords(a, b) {
	if (!a)
		return false;
	if (!b)
		return compareCoords(a[0], a[a.length - 1]); // Compare start with end
	return a[0] == b[0] && a[1] == b[1]; // 2 coords
}


/**
 * Controls examples
 */
function controlsCollection(options) {
	options = options || {};

	return [
		// Top right
		controlLayerSwitcher(Object.assign({
			baseLayers: options.baseLayers,
		}, options.controlLayerSwitcher)),
		controlPermalink(options.controlPermalink),

		// Bottom right
		new ol.control.Attribution(),

		// Bottom left
		new ol.control.ScaleLine(),
		controlMousePosition(),
		controlLengthLine(),

		// Top left
		new ol.control.Zoom(),
		controlFullScreen(),
		controlGeocoder(),
		controlGPS(options.controlGPS),
		controlLoadGPX(),
		controlDownload(options.controlDownload),
		controlPrint(),
	];
}