
import storeContainer from "./storeContainer";


export default function storeContainerWithOpts(mapShadowToProps, options) {
	return storeContainer(mapShadowToProps, null, null, options);
}