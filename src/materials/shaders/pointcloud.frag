precision highp float;
precision highp int;

uniform mat4 viewMatrix;
uniform vec3 cameraPosition;

uniform mat4 projectionMatrix;
uniform float opacity;

uniform float blendHardness;
uniform float blendDepthSupplement;
uniform float fov;
uniform float spacing;
uniform float pcIndex;
uniform float screenWidth;
uniform float screenHeight;

uniform sampler2D depthMap;

#if defined (clip_horizontally) || defined (clip_vertically)
	uniform vec4 clipExtent;
#endif

#ifdef use_texture_blending
	uniform sampler2D backgroundMap;
#endif


#ifdef use_point_cloud_mixing
	uniform int pointCloudMixingMode;
	uniform float pointCloudID;
	uniform float pointCloudMixAngle;
	uniform float stripeDistanceX;
	uniform float stripeDistanceY;

	uniform float stripeDivisorX;
	uniform float stripeDivisorY;
#endif

#ifdef highlight_point
	uniform vec4 highlightedPointColor;
#endif

in vec3 vColor;

#if !defined(color_type_point_index)
	in float vOpacity;
#endif

#if defined(weighted_splats)
	in float vLinearDepth;
#endif

#if !defined(paraboloid_point_shape) && defined(use_edl)
	in float vLogDepth;
#endif

#if defined(color_type_phong) && (MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0) || defined(paraboloid_point_shape)
	in vec3 vViewPosition;
#endif

#if defined(weighted_splats) || defined(paraboloid_point_shape)
	in float vRadius;
#endif

#if defined(color_type_phong) && (MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0)
	in vec3 vNormal;
#endif

#ifdef highlight_point
	in float vHighlight;
#endif

out vec4 outFragColor;

float specularStrength = 1.0;

void main() {
	vec3 color = vColor;
	float depth = gl_FragCoord.z;

	#if defined (clip_horizontally) || defined (clip_vertically)
	vec2 ndc = vec2((gl_FragCoord.x / screenWidth), 1.0 - (gl_FragCoord.y / screenHeight));

	if(step(clipExtent.x, ndc.x) * step(ndc.x, clipExtent.z) < 1.0)
	{
		discard;
	}

	if(step(clipExtent.y, ndc.y) * step(ndc.y, clipExtent.w) < 1.0)
	{
		discard;
	}
	#endif  

	#if defined(circle_point_shape) || defined(paraboloid_point_shape) || defined (weighted_splats)
		float u = 2.0 * gl_PointCoord.x - 1.0;
		float v = 2.0 * gl_PointCoord.y - 1.0;
	#endif

	#if defined(circle_point_shape) || defined (weighted_splats)
		float cc = u*u + v*v;
		if(cc > 1.0){
			discard;
		}
	#endif

	#if defined weighted_splats
		vec2 uv = gl_FragCoord.xy / vec2(screenWidth, screenHeight);
		float sDepth = texture(depthMap, uv).r;
		if(vLinearDepth > sDepth + vRadius + blendDepthSupplement){
			discard;
		}
	#endif

	#if defined color_type_point_index
		outFragColor = vec4(color, pcIndex / 255.0);
	#else
		outFragColor = vec4(color, vOpacity);
	#endif

	#ifdef use_point_cloud_mixing
		bool discardFragment = false;

		if (pointCloudMixingMode == 1) {  // Checkboard
			float vPointCloudID = pointCloudID > 10. ? pointCloudID/10.: pointCloudID;
			discardFragment = mod(gl_FragCoord.x, vPointCloudID) > 0.5 && mod(gl_FragCoord.y, vPointCloudID) > 0.5;
		}
		else if (pointCloudMixingMode == 2) {  // Stripes
			float angle = pointCloudMixAngle * pointCloudID / 180.;
			float u = cos(angle) * gl_FragCoord.x + sin(angle) * gl_FragCoord.y;
			float v = -sin(angle) * gl_FragCoord.x + cos(angle) * gl_FragCoord.y;

			discardFragment = mod(u, stripeDistanceX) >= stripeDistanceX/stripeDivisorX && mod(v, stripeDistanceY) >= stripeDistanceY/stripeDivisorY;
		}
		if (discardFragment) {
			discard;
		}
	#endif

	#ifdef use_texture_blending
		vec2 vUv = gl_FragCoord.xy / vec2(screenWidth, screenHeight);

		vec4 tColor = texture(backgroundMap, vUv);
		outFragColor = vec4(vOpacity * color, 1.) + vec4((1. - vOpacity) * tColor.rgb, 0.);
	#endif

	#if defined(color_type_phong)
		#if MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0
			vec3 normal = normalize( vNormal );
			normal.z = abs(normal.z);

			vec3 viewPosition = normalize( vViewPosition );
		#endif

		// code taken from three.js phong light fragment shader

		#if MAX_POINT_LIGHTS > 0

			vec3 pointDiffuse = vec3( 0.0 );
			vec3 pointSpecular = vec3( 0.0 );

			for ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {

				vec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );
				vec3 lVector = lPosition.xyz + vViewPosition.xyz;

				float lDistance = 1.0;
				if ( pointLightDistance[ i ] > 0.0 )
					lDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );

				lVector = normalize( lVector );

						// diffuse

				float dotProduct = dot( normal, lVector );

				#ifdef WRAP_AROUND

					float pointDiffuseWeightFull = max( dotProduct, 0.0 );
					float pointDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );

					vec3 pointDiffuseWeight = mix( vec3( pointDiffuseWeightFull ), vec3( pointDiffuseWeightHalf ), wrapRGB );

				#else

					float pointDiffuseWeight = max( dotProduct, 0.0 );

				#endif

				pointDiffuse += diffuse * pointLightColor[ i ] * pointDiffuseWeight * lDistance;

				// specular

				vec3 pointHalfVector = normalize( lVector + viewPosition );
				float pointDotNormalHalf = max( dot( normal, pointHalfVector ), 0.0 );
				float pointSpecularWeight = specularStrength * max( pow( pointDotNormalHalf, shininess ), 0.0 );

				float specularNormalization = ( shininess + 2.0 ) / 8.0;

				vec3 schlick = specular + vec3( 1.0 - specular ) * pow( max( 1.0 - dot( lVector, pointHalfVector ), 0.0 ), 5.0 );
				pointSpecular += schlick * pointLightColor[ i ] * pointSpecularWeight * pointDiffuseWeight * lDistance * specularNormalization;
				pointSpecular = vec3(0.0, 0.0, 0.0);
			}

		#endif

		#if MAX_DIR_LIGHTS > 0

			vec3 dirDiffuse = vec3( 0.0 );
			vec3 dirSpecular = vec3( 0.0 );

			for( int i = 0; i < MAX_DIR_LIGHTS; i ++ ) {

				vec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );
				vec3 dirVector = normalize( lDirection.xyz );

						// diffuse

				float dotProduct = dot( normal, dirVector );

				#ifdef WRAP_AROUND

					float dirDiffuseWeightFull = max( dotProduct, 0.0 );
					float dirDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );

					vec3 dirDiffuseWeight = mix( vec3( dirDiffuseWeightFull ), vec3( dirDiffuseWeightHalf ), wrapRGB );

				#else

					float dirDiffuseWeight = max( dotProduct, 0.0 );

				#endif

				dirDiffuse += diffuse * directionalLightColor[ i ] * dirDiffuseWeight;

				// specular

				vec3 dirHalfVector = normalize( dirVector + viewPosition );
				float dirDotNormalHalf = max( dot( normal, dirHalfVector ), 0.0 );
				float dirSpecularWeight = specularStrength * max( pow( dirDotNormalHalf, shininess ), 0.0 );

				float specularNormalization = ( shininess + 2.0 ) / 8.0;

				vec3 schlick = specular + vec3( 1.0 - specular ) * pow( max( 1.0 - dot( dirVector, dirHalfVector ), 0.0 ), 5.0 );
				dirSpecular += schlick * directionalLightColor[ i ] * dirSpecularWeight * dirDiffuseWeight * specularNormalization;
			}

		#endif

		vec3 totalDiffuse = vec3( 0.0 );
		vec3 totalSpecular = vec3( 0.0 );

		#if MAX_POINT_LIGHTS > 0

			totalDiffuse += pointDiffuse;
			totalSpecular += pointSpecular;

		#endif

		#if MAX_DIR_LIGHTS > 0

			totalDiffuse += dirDiffuse;
			totalSpecular += dirSpecular;

		#endif

		outFragColor.xyz = outFragColor.xyz * ( emissive + totalDiffuse + ambientLightColor * ambient ) + totalSpecular;

	#endif

	#if defined weighted_splats
	    //float w = pow(1.0 - (u*u + v*v), blendHardness);

		float wx = 2.0 * length(2.0 * gl_PointCoord - 1.0);
		float w = exp(-wx * wx * 0.5);

		//float distance = length(2.0 * gl_PointCoord - 1.0);
		//float w = exp( -(distance * distance) / blendHardness);

		outFragColor.rgb = outFragColor.rgb * w;
		outFragColor.a = w;
	#endif

	#if defined paraboloid_point_shape
		float wi = 0.0 - ( u*u + v*v);
		vec4 pos = vec4(vViewPosition, 1.0);
		pos.z += wi * vRadius;
		float linearDepth = -pos.z;
		pos = projectionMatrix * pos;
		pos = pos / pos.w;
		float expDepth = pos.z;
		depth = (pos.z + 1.0) / 2.0;
		gl_FragDepth = depth;

		#if defined(color_type_depth)
			outFragColor.r = linearDepth;
			outFragColor.g = expDepth;
		#endif

		#if defined(use_edl)
			outFragColor.a = log2(linearDepth);
		#endif

	#else
		#if defined(use_edl)
			outFragColor.a = vLogDepth;
		#endif
	#endif

	#ifdef highlight_point
		if (vHighlight > 0.0) {
			outFragColor = highlightedPointColor;
		}
	#endif
}
