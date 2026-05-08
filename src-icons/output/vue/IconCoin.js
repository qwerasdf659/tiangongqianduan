import { defineComponent, h } from 'vue';

export const IconCoin = defineComponent({
  name: 'IconCoin',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 768c-176.7 0-320-143.3-320-320s143.3-320 320-320 320 143.3 320 320-143.3 320-320 320zm-32-512h64v224h-64V320zm0 288h64v64h-64v-64z", "fillRule": "evenodd"}),
        h('path', {"d": "M480 320h64v224h-64zM480 608h64v64h-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
