import { defineComponent, h } from 'vue';

export const IconShoppingBag = defineComponent({
  name: 'IconShoppingBag',
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
        h('path', {"d": "M256 320l-64 576c0 36 28 64 64 64h512c36 0 64-28 64-64l-64-576H256z", "fillRule": "evenodd"}),
        h('path', {"d": "M384 320V256c0-70 58-128 128-128s128 58 128 128v64", "fillRule": "evenodd"})
      ]
    );
  }
});
