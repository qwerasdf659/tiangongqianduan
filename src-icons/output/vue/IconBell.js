import { defineComponent, h } from 'vue';

export const IconBell = defineComponent({
  name: 'IconBell',
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
        h('path', {"d": "M208 672V448c0-168 136-304 304-304s304 136 304 304v224l80 128H128l80-128z", "fillRule": "evenodd"}),
        h('path', {"d": "M416 832c0 53 43 96 96 96s96-43 96-96", "fillRule": "evenodd"})
      ]
    );
  }
});
