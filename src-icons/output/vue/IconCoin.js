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
        h('path', {"d": "M128 400v224c0 115 172 208 384 208s384-93 384-208V400", "fillRule": "evenodd"}),
        h('path', {"d": "M128 512c0 115 172 208 384 208s384-93 384-208", "fillRule": "evenodd"})
      ]
    );
  }
});
