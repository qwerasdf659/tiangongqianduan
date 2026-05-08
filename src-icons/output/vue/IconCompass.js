import { defineComponent, h } from 'vue';

export const IconCompass = defineComponent({
  name: 'IconCompass',
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
        h('path', {"d": "M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 128c176.7 0 320 143.3 320 320s-143.3 320-320 320-320-143.3-320-320 143.3-320 320-320z", "fillRule": "evenodd"}),
        h('path', {"d": "M448 384l192 128-192 128V384z", "fillRule": "evenodd"})
      ]
    );
  }
});
